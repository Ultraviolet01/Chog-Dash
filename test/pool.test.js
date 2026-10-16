/*
 * Tickets and the weekly prize pool (lib/pool.js and its hooks in lib/handlers.js), with a simulated chain:
 * the pool contract's views, $CHOG balances, ticket purchase receipts and the $CHOG price.
 */
const test = require("node:test");
const assert = require("node:assert");
const viem = require("viem");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const { createHandlers } = require("../lib/handlers.js");
const { memoryStore } = require("../lib/store.js");
const config = require("../js/config.js");
const Quests = require("../js/quests.js");

const WEI = 10n ** 18n;
const POOL = "0x00000000000000000000000000000000000c0de1";

function setup({ registered = true } = {}) {
  let t = Date.UTC(2026, 9, 14, 12);   // a Wednesday
  const now = () => t;
  const admin = privateKeyToAccount(generatePrivateKey());
  const alice = privateKeyToAccount(generatePrivateKey());
  const bob = privateKeyToAccount(generatePrivateKey());
  const low = a => a.address.toLowerCase();
  const owners = { "1": low(alice), "2": low(bob), "3": low(admin) };
  const metadata = { name: "Chog", attributes: [{ trait_type: "Tier", value: "Common" }] };
  // The simulated pool contract
  const chainState = { price: 0.00166, owner: low(admin), chog: config.tickets.token, balance: 0n, lastPaid: 0, available: {}, receipts: {} };
  const chain = {
    async ownerOf(id) { if (!owners[id]) throw new Error("revert"); return owners[id]; },
    async tokenURI(id) { return "ipfs://cid/" + id; },
    async balanceOf(w) { return BigInt(Object.values(owners).filter(o => o === w.toLowerCase()).length); },
    async fetchMetadata() { return metadata; },
    verifySignature: args => viem.verifyMessage(args),
    async chogUsd() { if (chainState.price == null) throw new Error("down"); return chainState.price; },
    async tokenBalance() { return chainState.balance; },
    async pool(addr, fn, args = []) {
      if (addr.toLowerCase() !== POOL) throw new Error("not a pool");
      if (fn === "owner") return chainState.owner;
      if (fn === "chog") return chainState.chog;
      if (fn === "lastPaidWeek") return BigInt(chainState.lastPaid);
      if (fn === "available") return chainState.available[Number(args[0])] || 0n;
      throw new Error("unknown view " + fn);
    },
    async ticketPurchases(hash) { return chainState.receipts[hash] || null; },
  };
  const store = memoryStore(now);
  const h = createHandlers({ store, chain, secret: "s", now, poolAdmin: admin.address, poolAddress: registered ? POOL : undefined });
  async function signIn(acct, name) {
    const { message } = await h.authNonce({ body: { wallet: acct.address } });
    const signature = await acct.signMessage({ message });
    const token = (await h.authVerify({ body: { wallet: acct.address, message, signature } })).token;
    if (name) await h.profileSet({ body: { username: name }, token });
    return token;
  }
  // A mined purchase paying `amount` with a quote's ref
  const pay = (hash, acct, ref, amount, at = t) => {
    chainState.receipts[hash] = { failed: false, blockTime: at, events: [{ player: low(acct), week: Quests.weekNumber(at), amount, ref: ref.toLowerCase() }] };
  };
  // A run: start, take off, fly `ms`, finish with `meters`
  async function run(token, tokenId, meters, ms = 30000) {
    const s = await h.runStart({ body: { tokenId }, token });
    const fly = await h.runFly({ body: { runId: s.runId }, token });
    t += ms;
    const fin = await h.runFinish({ body: { runId: s.runId, meters, durationMs: ms - 1000 }, token });
    return { s, fly, fin };
  }
  return { h, store, chainState, admin, alice, bob, low, signIn, pay, run, now, advance: ms => { t += ms; }, setTime: v => { t = v; } };
}
const status = async p => { try { await p; return 200; } catch (e) { return e.status; } };
const hash = n => "0x" + n.toString(16).padStart(64, "0");

test("pool info: price per ticket, this week, the prize now, your tickets", async () => {
  const { h, chainState, signIn, alice } = setup();
  chainState.balance = 3000n * WEI;
  const ta = await signIn(alice, "Alice");
  const p = await h.pool({ token: ta });
  assert.strictEqual(p.enabled, true);
  assert.strictEqual(p.address, POOL);
  assert.strictEqual(p.perTicket, (302n * WEI).toString(), "$0.50 / $0.00166 = 301.2, rounded up to 302 CHOG");
  assert.strictEqual(p.week, Quests.weekNumber(Date.UTC(2026, 9, 14, 12)));
  assert.strictEqual(p.weekEndsAt, Date.UTC(2026, 9, 19), "next Monday 00:00 UTC");
  assert.strictEqual(p.current, (3000n * WEI).toString());
  assert.deepStrictEqual(p.me, { tickets: 0 });
  assert.deepStrictEqual(p.split, [25, 18, 13, 10, 8, 7, 6, 5, 4, 4]);
});

test("quotes: holders only, 1 to 20 tickets, priced from the live $CHOG price", async () => {
  const { h, chainState, signIn, alice } = setup();
  const nobody = privateKeyToAccount(generatePrivateKey());
  const tn = await signIn(nobody);
  assert.strictEqual(await status(h.ticketQuote({ body: { count: 1 }, token: tn })), 403, "not a Chog holder");
  const ta = await signIn(alice, "Alice");
  assert.strictEqual(await status(h.ticketQuote({ body: { count: 0 }, token: ta })), 400);
  assert.strictEqual(await status(h.ticketQuote({ body: { count: 21 }, token: ta })), 400);
  const q = await h.ticketQuote({ body: { count: 3 }, token: ta });
  assert.strictEqual(q.amount, (906n * WEI).toString(), "3 x 302 CHOG");
  assert.match(q.ref, /^0x[0-9a-f]{64}$/);
  assert.strictEqual(q.pool, POOL);
  chainState.price = null;
  await h.ticketQuote({ body: { count: 1 }, token: ta });   // the price is cached for a minute
});

test("claims: a mined payment matching the quote credits tickets once", async () => {
  const { h, signIn, alice, bob, pay, advance } = setup();
  const ta = await signIn(alice, "Alice"), tb = await signIn(bob, "Bob");
  const q = await h.ticketQuote({ body: { count: 2 }, token: ta });
  assert.deepStrictEqual(await h.ticketClaim({ body: { txHash: hash(1) }, token: ta }), { status: "pending", tickets: 0 }, "not mined yet");
  pay(hash(1), alice, q.ref, BigInt(q.amount));
  assert.strictEqual(await status(h.ticketClaim({ body: { txHash: hash(1) }, token: tb })), 400, "someone else's purchase");
  const c = await h.ticketClaim({ body: { txHash: hash(1) }, token: ta });
  assert.deepStrictEqual([c.status, c.count, c.tickets], ["credited", 2, 2]);
  const again = await h.ticketClaim({ body: { txHash: hash(1) }, token: ta });
  assert.deepStrictEqual([again.status, again.already, again.tickets], ["credited", true, 2], "the same payment never credits twice");
  // Paying the same quote again before it expires buys again
  pay(hash(2), alice, q.ref, BigInt(q.amount));
  assert.strictEqual((await h.ticketClaim({ body: { txHash: hash(2) }, token: ta })).tickets, 4);
  // Too little, an unknown quote, a failed transaction, an expired quote
  const q2 = await h.ticketQuote({ body: { count: 1 }, token: ta });
  pay(hash(3), alice, q2.ref, BigInt(q2.amount) - 1n);
  assert.strictEqual(await status(h.ticketClaim({ body: { txHash: hash(3) }, token: ta })), 400, "less than quoted");
  pay(hash(4), alice, "0x" + "ab".repeat(32), 10n ** 30n);
  assert.strictEqual(await status(h.ticketClaim({ body: { txHash: hash(4) }, token: ta })), 400, "no such quote");
  const q3 = await h.ticketQuote({ body: { count: 1 }, token: ta });
  advance(12 * 60e3);   // 10 minutes + the minute allowed for the block, plus one
  pay(hash(5), alice, q3.ref, BigInt(q3.amount));
  assert.strictEqual(await status(h.ticketClaim({ body: { txHash: hash(5) }, token: ta })), 400, "paid after the quote expired");
  assert.strictEqual(await status(h.ticketClaim({ body: { txHash: "0x12" }, token: ta })), 400, "not a transaction hash");
  assert.strictEqual((await h.pool({ token: ta })).me.tickets, 4);
});

test("a ticket is spent when the rocket takes off; no ticket = flies but not ranked", async () => {
  const { h, store, signIn, alice, pay, run, low } = setup();
  const ta = await signIn(alice, "Alice");
  // No tickets yet
  const r0 = await run(ta, "1", 500);
  assert.deepStrictEqual([r0.s.ticketsOn, r0.s.tickets], [true, 0]);
  assert.deepStrictEqual(r0.fly, { ticketed: false, tickets: 0 });
  assert.strictEqual(r0.fin.status, "unranked");
  assert.ok(r0.fin.quests, "quests still count without a ticket");
  assert.strictEqual((await h.leaderboard({})).entries.length, 0, "not on the weekly board");
  // Buy 2, fly 2 ranked runs
  const q = await h.ticketQuote({ body: { count: 2 }, token: ta });
  pay(hash(9), alice, q.ref, BigInt(q.amount));
  await h.ticketClaim({ body: { txHash: hash(9) }, token: ta });
  const r1 = await run(ta, "1", 400);
  assert.deepStrictEqual(r1.fly, { ticketed: true, tickets: 1 });
  assert.deepStrictEqual([r1.fin.status, r1.fin.rank], ["validated", 1]);
  // Taking off twice with one session spends one ticket
  const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
  await h.runFly({ body: { runId: s.runId }, token: ta });
  const twice = await h.runFly({ body: { runId: s.runId }, token: ta });
  assert.deepStrictEqual([twice.ticketed, twice.tickets, twice.already], [true, 0, true]);
  assert.strictEqual(await store.get("tickets:" + low(alice)), 0);
  const lb = await h.leaderboard({});
  assert.deepStrictEqual(lb.entries.map(e => e.meters), [400], "only the ticketed run is ranked");
});

test("the run time is checked from take-off", async () => {
  const { h, signIn, alice, pay, advance } = setup({ registered: false });
  const ta = await signIn(alice, "Alice");
  const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(60000);   // waited on the ready screen
  await h.runFly({ body: { runId: s.runId }, token: ta });
  advance(10000);
  const fin = await h.runFinish({ body: { runId: s.runId, meters: 100, durationMs: 40000 }, token: ta });
  assert.deepStrictEqual([fin.status, fin.reason], ["rejected", "Run time is longer than the session existed"]);
});

test("before a pool is registered, runs are ranked without tickets (weekly board)", async () => {
  const { h, signIn, alice, run } = setup({ registered: false });
  const ta = await signIn(alice, "Alice");
  assert.strictEqual((await h.pool({})).enabled, false);
  assert.strictEqual(await status(h.ticketQuote({ body: { count: 1 }, token: ta })), 409);
  const r = await run(ta, "1", 300);
  assert.deepStrictEqual([r.s.ticketsOn, r.fly.ticketed, r.fin.status], [false, true, "validated"]);
  assert.strictEqual((await h.leaderboard({})).entries.length, 1);
});

test("the weekly board resets on Monday 00:00 UTC; past weeks stay viewable", async () => {
  const { h, signIn, alice, bob, run, setTime } = setup({ registered: false });
  const ta = await signIn(alice, "Alice"), tb = await signIn(bob, "Bob");
  await run(ta, "1", 900);
  const w = (await h.leaderboard({})).week;
  setTime(Date.UTC(2026, 9, 19, 0, 0, 1));   // next Monday
  const now = await h.leaderboard({ token: await signIn(alice) });
  assert.deepStrictEqual([now.week, now.entries.length, now.me.rank], [w + 1, 0, null], "a fresh week");
  await run(await signIn(bob), "2", 100);
  assert.deepStrictEqual((await h.leaderboard({})).entries.map(e => [e.username, e.meters]), [["Bob", 100]], "only this week's runs");
  const last = await h.leaderboard({ query: { week: String(w) } });
  assert.deepStrictEqual([last.week, last.current, last.entries.map(e => e.meters)], [w, false, [900]]);
  assert.strictEqual((await h.leaderboard({ query: { week: "999999" } })).week, w + 1, "a future week means this week");
});

test("results: the top 10 share what the contract can pay for the week, after the review window", async () => {
  const { h, chainState, signIn, alice, bob, admin, run, setTime } = setup({ registered: false });
  const ta = await signIn(alice, "Alice"), tb = await signIn(bob, "Bob");
  await run(ta, "1", 900); await run(tb, "2", 500);
  const w = (await h.leaderboard({})).week;
  const r0 = await h.poolResults({ query: { week: String(w) } });
  assert.deepStrictEqual([r0.ended, r0.payable, r0.available], [false, false, null], "the week is still running");
  // Register the pool (owner only, checked on-chain)
  const tadm = await signIn(admin);
  assert.strictEqual(await status(h.poolRegister({ body: { address: POOL }, token: ta })), 403, "not the owner");
  chainState.owner = "0x" + "1".repeat(40);
  assert.strictEqual(await status(h.poolRegister({ body: { address: POOL }, token: tadm })), 400, "pool owned by someone else");
  chainState.owner = admin.address.toLowerCase();
  chainState.chog = "0x" + "2".repeat(40);
  assert.strictEqual(await status(h.poolRegister({ body: { address: POOL }, token: tadm })), 400, "pool for another token");
  chainState.chog = config.tickets.token;
  assert.strictEqual(await status(h.poolRegister({ body: { address: "0x" + "3".repeat(40) }, token: tadm })), 400, "not a pool");
  assert.deepStrictEqual(await h.poolRegister({ body: { address: POOL }, token: tadm }), { address: POOL });
  // Week over, inside the 24 h review window
  setTime(Date.UTC(2026, 9, 19, 6));
  chainState.available[w] = 1000n * WEI;
  const r1 = await h.poolResults({});
  assert.strictEqual(r1.week, w, "defaults to last week");
  assert.deepStrictEqual(r1.winners.map(x => [x.rank, x.username, x.share, x.amount]),
    [[1, "Alice", 25, (250n * WEI).toString()], [2, "Bob", 18, (180n * WEI).toString()]], "ranks 3-10 are empty: their shares roll over");
  assert.strictEqual(r1.payable, false, "still in review");
  // Disqualify (owner only), then pay after review
  const tb2 = await signIn(bob), tadm2 = await signIn(admin);   // a new day: sign in again
  assert.strictEqual(await status(h.poolDisqualify({ body: { week: w, wallet: alice.address, reason: "x" }, token: tb2 })), 403);
  const r2 = await h.poolDisqualify({ body: { week: w, wallet: alice.address, reason: "impossible run" }, token: tadm2 });
  assert.deepStrictEqual(r2.winners.map(x => [x.rank, x.username, x.share]), [[1, "Bob", 25]], "Bob moves up");
  assert.strictEqual(r2.disqualified[0].reason, "impossible run");
  setTime(Date.UTC(2026, 9, 20, 1));
  assert.strictEqual((await h.poolResults({})).payable, true, "review over");
  chainState.lastPaid = w;
  const r3 = await h.poolResults({});
  assert.deepStrictEqual([r3.paid, r3.payable], [true, false], "paid on-chain");
  assert.strictEqual(await status(h.poolDisqualify({ body: { week: w, wallet: bob.address }, token: await signIn(admin) })), 409, "can't change a paid week");
});

test("the prize shown now leaves out a finished week waiting for its payout", async () => {
  const { h, chainState } = setup();
  const p0 = await h.pool({});
  chainState.balance = 5000n * WEI;
  chainState.lastPaid = p0.week - 2;              // last week not paid yet
  chainState.available[p0.week - 1] = 1800n * WEI;
  const p = await h.pool({});
  assert.strictEqual(p.current, (3200n * WEI).toString());
  assert.deepStrictEqual(p.lastWeek, { week: p0.week - 1, paid: false, amount: (1800n * WEI).toString() });
});
