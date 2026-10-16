/*
 * Tickets and the weekly prize pool (Chog NFT mode).
 *
 * - A ticket is one ranked Chog NFT run. Players pay $CHOG into the pool contract (contracts/ChogDashPool.sol):
 *   the server quotes how much $CHOG is worth $0.50 (quote), the player's wallet pays it with buyTickets(amount, ref),
 *   then the server reads that transaction on-chain and credits the tickets (claim). `ref` is the quote id, so a
 *   payment matches exactly one quote and is credited once.
 * - A ticket is spent when the rocket starts flying (fly), not when the result is sent, so a bad run can't be
 *   abandoned for free.
 * - Weeks start Monday 00:00 UTC (js/quests.js). The weekly Chog NFT leaderboard's top 10 share the pool by
 *   config.tickets.split; shares nobody earns, and anything not paid out, stay in the contract for later weeks.
 * - The pool owner (POOL_ADMIN) registers the deployed contract, can disqualify a player from a week before the
 *   payout, and pays the winners from their own wallet (the admin page). The server never holds keys or moves money.
 * - Until a pool contract is registered, Chog NFT runs are ranked without tickets (as before).
 */
const crypto = require("crypto");
const config = require("../js/config.js");
const Quests = require("../js/quests.js");

const TK = config.tickets;
const DAY_MS = 86400e3;
const PRICE_TTL = 60;            // seconds a fetched $CHOG price is reused
const QUOTE_KEEP = 14 * 86400;   // a quote is kept two weeks, so a slow claim still finds it
const isAddress = a => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
const isTxHash = h => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
const weekStart = w => (w * 7 - 3) * DAY_MS;   // inverse of Quests.weekNumber

function createPool({ store, chain, HttpError, verifyToken, isHolder, now, admin, poolAddress }) {
  const adminWallet = isAddress(admin) ? admin.toLowerCase() : null;

  async function address() {
    if (isAddress(poolAddress)) return poolAddress.toLowerCase();
    return store.get("pool:address");
  }
  const weekNow = () => Quests.weekNumber(now());

  // $CHOG per ticket in wei (rounded up to a whole $CHOG), from a price at most a minute old
  async function ticketPrice() {
    let p = await store.get("price:chog");
    if (!p) {
      let usd;
      try { usd = await chain.chogUsd(); } catch (e) { throw new HttpError(503, "The $CHOG price is unavailable right now, try again in a moment"); }
      if (!(usd > 0)) throw new HttpError(503, "The $CHOG price is unavailable right now");
      const whole = Math.ceil(TK.priceUsd / usd);
      p = { usd, perTicket: (BigInt(whole) * 10n ** BigInt(TK.decimals)).toString(), at: now() };
      await store.set("price:chog", p, PRICE_TTL);
    }
    return p;
  }

  function requireAdmin(token) {
    const wallet = verifyToken(token);
    if (!adminWallet || wallet !== adminWallet) throw new HttpError(403, "Only the pool owner can do this");
    return wallet;
  }

  // What is in the pool now. "current": the prize for the running week (everything held, minus a finished
  // week that hasn't been paid yet). lastWeek: the finished week waiting for its payout, if any.
  async function poolState(addr) {
    const cur = weekNow();
    const [balance, lastPaid, prevAvail] = await Promise.all([
      chain.tokenBalance(TK.token, addr), chain.pool(addr, "lastPaidWeek"), chain.pool(addr, "available", [BigInt(cur - 1)]),
    ]);
    const prevUnpaid = Number(lastPaid) < cur - 1 ? prevAvail : 0n;
    return { balance, lastPaidWeek: Number(lastPaid), current: balance - prevUnpaid, lastWeekUnpaid: prevUnpaid };
  }

  // The payout plan for a finished week: its top 10 and their shares of what the contract can pay for it
  async function results(week) {
    const addr = await address();
    const top = await store.week(week).top(TK.split.length);
    const names = top.length ? await store.mget(top.map(r => "user:" + r.wallet)) : [];
    const ended = week < weekNow(), endsAt = weekStart(week + 1), reviewEndsAt = endsAt + TK.reviewHours * 3600e3;
    let available = null, paid = false;
    if (addr && ended) {
      const [avail, lastPaid] = await Promise.all([chain.pool(addr, "available", [BigInt(week)]), chain.pool(addr, "lastPaidWeek")]);
      available = avail; paid = Number(lastPaid) >= week;
    }
    const winners = top.map((r, i) => ({
      rank: i + 1, wallet: r.wallet, username: names[i] || null, name: r.name, tokenId: r.tokenId, total: r.finalScore,
      share: TK.split[i], amount: available != null ? (available * BigInt(TK.split[i]) / 100n).toString() : null,
    }));
    return {
      week, startsAt: weekStart(week), endsAt, reviewEndsAt, ended, paid,
      available: available != null ? available.toString() : null,
      payable: !!addr && ended && !paid && now() >= reviewEndsAt && winners.length > 0,
      winners, disqualified: (await store.get("dq:" + week)) || [], pool: addr,
    };
  }

  return {
    weekNow,
    enabled: async () => !!(await address()),

    // At the start of a ranked run's flight: spends one ticket. Returns { ticketed, tickets } (tickets left).
    async spendTicket(wallet) {
      if (!(await address())) return { ticketed: true, tickets: null };   // no pool yet: runs are free
      const left = await store.add("tickets:" + wallet, -1, 0);
      if (left == null) return { ticketed: false, tickets: 0 };
      return { ticketed: true, tickets: left };
    },
    async tickets(wallet) { return (await store.get("tickets:" + wallet)) || 0; },

    handlers: {
      // GET -> the pool: contract, token, ticket price, this week, the prize now, and (signed in) your tickets
      async pool({ token }) {
        const addr = await address(), w = weekNow();
        const out = {
          enabled: !!addr, address: addr, admin: adminWallet, token: TK.token, symbol: TK.symbol, decimals: TK.decimals,
          priceUsd: TK.priceUsd, split: TK.split, buyUrl: TK.buyUrl, week: w, weekEndsAt: weekStart(w + 1),
          perTicket: null, chogUsd: null, current: null, lastWeek: null, me: null,
        };
        if (addr) {
          try { const p = await ticketPrice(); out.perTicket = p.perTicket; out.chogUsd = p.usd; } catch (e) { /* the price can be missing */ }
          try {
            const s = await poolState(addr);
            out.current = s.current.toString();
            out.lastWeek = { week: w - 1, paid: s.lastPaidWeek >= w - 1, amount: s.lastWeekUnpaid.toString() };
          } catch (e) { console.error("pool: chain read failed:", e.message); }
        }
        if (token) {
          let wallet = null;
          try { wallet = verifyToken(token); } catch (e) {}
          if (wallet) out.me = { tickets: (await store.get("tickets:" + wallet)) || 0 };
        }
        return out;
      },

      // POST { count } (signed in, Chog holders) -> a quote: pay `amount` $CHOG with ref `ref` before `expiresAt`
      async ticketQuote({ body, token }) {
        const wallet = verifyToken(token);
        const addr = await address();
        if (!addr) throw new HttpError(409, "Tickets aren't on sale yet");
        if (!(await isHolder(wallet))) throw new HttpError(403, "Tickets are for Chog Genesis holders (Chog NFT mode)");
        const count = body && body.count;
        if (!Number.isInteger(count) || count < 1 || count > TK.maxPerBuy) throw new HttpError(400, "Buy between 1 and " + TK.maxPerBuy + " tickets");
        const p = await ticketPrice();
        const id = crypto.randomBytes(32).toString("hex");
        const quote = { wallet, count, amount: (BigInt(p.perTicket) * BigInt(count)).toString(), usd: p.usd,
          expiresAt: now() + TK.quoteSeconds * 1000, pool: addr };
        await store.set("quote:" + id, quote, QUOTE_KEEP);
        return { ref: "0x" + id, count, amount: quote.amount, perTicket: p.perTicket, chogUsd: p.usd, expiresAt: quote.expiresAt,
          pool: addr, token: TK.token, decimals: TK.decimals };
      },

      // POST { txHash } (signed in) -> { status: "credited" | "pending", tickets }. Credits a mined purchase once.
      async ticketClaim({ body, token }) {
        const wallet = verifyToken(token);
        const addr = await address();
        if (!addr) throw new HttpError(409, "Tickets aren't on sale yet");
        const txHash = body && typeof body.txHash === "string" ? body.txHash.toLowerCase() : "";
        if (!isTxHash(txHash)) throw new HttpError(400, "Invalid transaction");
        if (await store.get("txdone:" + txHash)) return { status: "credited", already: true, tickets: (await store.get("tickets:" + wallet)) || 0 };
        let got;
        try { got = await chain.ticketPurchases(txHash, addr); }
        catch (e) { throw new HttpError(502, "Couldn't read the transaction on-chain right now, try again"); }
        if (!got) return { status: "pending", tickets: (await store.get("tickets:" + wallet)) || 0 };
        if (got.failed) throw new HttpError(400, "That transaction failed on-chain, so nothing was paid");
        const ev = got.events.find(e => e.player === wallet);
        if (!ev) throw new HttpError(400, "That transaction isn't a ticket purchase from this wallet");
        const quote = await store.get("quote:" + ev.ref.slice(2));
        if (!quote || quote.wallet !== wallet || quote.pool !== addr) throw new HttpError(400, "That purchase doesn't match a ticket quote for this wallet");
        if (ev.amount < BigInt(quote.amount)) throw new HttpError(400, "Less $CHOG arrived than the quote asked for");
        // A quote can be paid until it expires (plus a minute for the block to be made)
        if (got.blockTime > quote.expiresAt + 60e3) throw new HttpError(400, "That quote had expired when it was paid; ask for a new one");
        // Each payment is credited once (paying the same quote twice before it expires buys twice)
        if (!(await store.setNX("txdone:" + txHash, wallet))) return { status: "credited", already: true, tickets: (await store.get("tickets:" + wallet)) || 0 };
        const tickets = await store.add("tickets:" + wallet, quote.count, 0);
        await store.pushRun({ kind: "tickets", wallet, count: quote.count, amount: ev.amount.toString(), txHash, week: ev.week, at: now() });
        return { status: "credited", count: quote.count, tickets };
      },

      // GET ?week= -> a week's payout plan (public, so anyone can check the payouts against the leaderboard)
      async poolResults({ query }) {
        const w = query && query.week != null && /^\d{1,6}$/.test(String(query.week)) ? Number(query.week) : weekNow() - 1;
        return results(w);
      },

      // POST { address } (pool owner) -> registers the deployed pool contract after checking it on-chain
      async poolRegister({ body, token }) {
        const wallet = requireAdmin(token);
        const addr = body && body.address;
        if (!isAddress(addr)) throw new HttpError(400, "Invalid contract address");
        let owner, chog;
        try { [owner, chog] = await Promise.all([chain.pool(addr, "owner"), chain.pool(addr, "chog")]); }
        catch (e) { throw new HttpError(400, "That address isn't a Chog Dash pool contract on Monad"); }
        if (owner.toLowerCase() !== wallet) throw new HttpError(400, "That pool is owned by another wallet");
        if (chog.toLowerCase() !== TK.token) throw new HttpError(400, "That pool doesn't take $CHOG");
        await store.set("pool:address", addr.toLowerCase());
        return { address: addr.toLowerCase() };
      },

      // POST { week, wallet, reason } (pool owner) -> removes a player from a week's leaderboard before the payout
      async poolDisqualify({ body, token }) {
        requireAdmin(token);
        const { week, wallet, reason } = body || {};
        if (!Number.isInteger(week) || !isAddress(wallet)) throw new HttpError(400, "Missing week or wallet");
        const r = await results(week);
        if (r.paid) throw new HttpError(409, "That week was already paid out");
        await store.week(week).remove(wallet.toLowerCase());
        const dq = (await store.get("dq:" + week)) || [];
        dq.push({ wallet: wallet.toLowerCase(), reason: typeof reason === "string" ? reason.slice(0, 200) : "", at: now() });
        await store.set("dq:" + week, dq);
        return results(week);
      },
    },
  };
}

module.exports = { createPool, weekStart };
