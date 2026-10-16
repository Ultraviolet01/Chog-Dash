/*
 * Ticket and prize pool transactions from the player's (or the pool owner's) own wallet, over EIP-1193.
 * The wallet signs every transaction; nothing here holds keys. Encoding is done by hand (no library), and the
 * unit tests check it against viem.
 *   - Players: approve $CHOG for the pool, then buyTickets(amount, ref) with the server's quote.
 *   - The pool owner (admin page): deploy the pool contract, pay a week's winners, skip an empty week.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else root.ChogTickets = factory(root.ChogConfig);
})(typeof self !== "undefined" ? self : this, function (config) {
  const TK = config.tickets;
  const SEL = {
    approve: "0x095ea7b3",       // approve(address,uint256)
    allowance: "0xdd62ed3e",     // allowance(address,address)
    balanceOf: "0x70a08231",     // balanceOf(address)
    buyTickets: "0xc03cc33f",    // buyTickets(uint256,bytes32)
    payWinners: "0xde3400c8",    // payWinners(uint256,address[],uint256[])
    skipWeek: "0xa8b5653d",      // skipWeek(uint256)
    owner: "0x8da5cb5b",         // owner()
    lastPaidWeek: "0x6c83d2d5",  // lastPaidWeek()
    available: "0x96e494e8",     // available(uint256)
    currentWeek: "0x06575c89",   // currentWeek()
  };
  const word = v => BigInt(v).toString(16).padStart(64, "0");
  const addr = a => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const b32 = h => h.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const uint = data => BigInt(data && data !== "0x" ? data.slice(0, 66) : "0x0");

  const enc = {
    approve: (spender, amount) => SEL.approve + addr(spender) + word(amount),
    allowance: (owner, spender) => SEL.allowance + addr(owner) + addr(spender),
    balanceOf: owner => SEL.balanceOf + addr(owner),
    buyTickets: (amount, ref) => SEL.buyTickets + word(amount) + b32(ref),
    skipWeek: week => SEL.skipWeek + word(week),
    available: week => SEL.available + word(week),
    // payWinners(uint256 week, address[] winners, uint256[] amounts): head (week, offset, offset), then the arrays
    payWinners(week, winners, amounts) {
      const n = winners.length, a = 3 * 32, b = a + 32 + n * 32;
      return SEL.payWinners + word(week) + word(a) + word(b) +
        word(n) + winners.map(addr).join("") + word(n) + amounts.map(word).join("");
    },
    // Contract creation: bytecode + constructor(address chogToken)
    deploy: (bytecode, token) => bytecode + addr(token),
  };

  const call = (provider, to, data) => provider.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  async function send(provider, from, to, data) {
    const tx = { from, data };
    if (to) tx.to = to;
    return provider.request({ method: "eth_sendTransaction", params: [tx] });
  }
  // Waits for a transaction to be mined (Monad blocks are fast). Returns the receipt; throws if it failed.
  async function wait(provider, hash, timeoutMs = 120000) {
    const t0 = Date.now();
    for (;;) {
      const r = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null);
      if (r) {
        if (r.status !== "0x1") throw new Error("The transaction failed on-chain");
        return r;
      }
      if (Date.now() - t0 > timeoutMs) throw new Error("The transaction is taking long; it may still go through. Check your wallet");
      await new Promise(res => setTimeout(res, 1200));
    }
  }

  return {
    SEL, enc, wait,
    async chogBalance(provider, owner) { return uint(await call(provider, TK.token, enc.balanceOf(owner))); },
    async allowance(provider, owner, spender) { return uint(await call(provider, TK.token, enc.allowance(owner, spender))); },
    // Lets the pool take exactly `amount` $CHOG (approve only what this purchase needs)
    approve: (provider, from, pool, amount) => send(provider, from, TK.token, enc.approve(pool, amount)),
    buy: (provider, from, pool, amount, ref) => send(provider, from, pool, enc.buyTickets(amount, ref)),
    // Pool owner
    deploy: (provider, from, bytecode) => send(provider, from, null, enc.deploy(bytecode, TK.token)),
    payWinners: (provider, from, pool, week, winners, amounts) => send(provider, from, pool, enc.payWinners(week, winners, amounts)),
    skipWeek: (provider, from, pool, week) => send(provider, from, pool, enc.skipWeek(week)),
    async poolOwner(provider, pool) { return "0x" + (await call(provider, pool, SEL.owner)).slice(26, 66).toLowerCase(); },
    async lastPaidWeek(provider, pool) { return Number(uint(await call(provider, pool, SEL.lastPaidWeek))); },
    // Formats wei as $CHOG with up to `dp` decimals: 1234.5 -> "1,234.5"
    format(wei, dp = 0) {
      const v = BigInt(wei || 0), base = 10n ** BigInt(TK.decimals);
      const whole = (v / base).toLocaleString("en-US");
      if (!dp) return whole;
      const frac = (v % base).toString().padStart(TK.decimals, "0").slice(0, dp).replace(/0+$/, "");
      return frac ? whole + "." + frac : whole;
    },
  };
});
