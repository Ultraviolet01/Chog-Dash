const test = require("node:test");
const assert = require("node:assert");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const viem = require("viem");
const { createHandlers } = require("../lib/handlers.js");
const { memoryStore } = require("../lib/store.js");
const Career = require("../js/career.js");
const Traits = require("../js/traits.js");
const config = require("../js/config.js");

const DAY = 864e5;
// Monday 2026-10-19 00:00 UTC: week 2964, whose trait of the week is the first in the rotation (Fire Auras)
const MONDAY = Date.UTC(2026, 9, 19);

function setup() {
  let t = MONDAY + 3600e3;
  const now = () => t;
  const alice = privateKeyToAccount(generatePrivateKey());
  const bob = privateKeyToAccount(generatePrivateKey());
  const owners = { "1": alice.address.toLowerCase(), "2": alice.address.toLowerCase() };
  const metadata = {
    "1": { name: "Fire Chog", image: "ipfs://img/1", attributes: [{ trait_type: "Aura", value: "Fiery Aura" }, { trait_type: "Tier", value: "Rare" }] },
    "2": { name: "Plain Chog", image: "ipfs://img/2", attributes: [{ trait_type: "Aura", value: "Mint" }, { trait_type: "Tier", value: "Common" }] },
  };
  const chain = {
    async ownerOf(id) { if (!owners[id]) throw new Error("revert"); return owners[id]; },
    async tokenURI(id) { if (!metadata[id]) throw new Error("revert"); return "ipfs://cid/" + id; },
    async balanceOf(w) { return BigInt(Object.values(owners).filter(o => o === w.toLowerCase()).length); },
    async fetchMetadata(uri) { return metadata[uri.split("/").pop()]; },
    verifySignature: args => viem.verifyMessage(args),
  };
  const store = memoryStore(now);
  const h = createHandlers({ store, chain, secret: "test-secret", now });
  async function signIn(acct, name) {
    const { message } = await h.authNonce({ body: { wallet: acct.address } });
    const signature = await acct.signMessage({ message });
    const token = (await h.authVerify({ body: { wallet: acct.address, message, signature } })).token;
    await h.profileSet({ body: { username: name }, token });
    return token;
  }
  async function run(token, tokenId, meters, secs = Math.ceil(meters / 25) + 5) {   // a believable run time for the distance
    const s = await h.runStart({ body: { tokenId }, token });
    await h.runFly({ body: { runId: s.runId }, token });
    t += secs * 1000;
    return { start: s, fin: await h.runFinish({ body: { runId: s.runId, meters, durationMs: (secs - 1) * 1000 }, token }) };
  }
  return { h, store, owners, alice, bob, signIn, run, advance: ms => { t += ms; } };
}

test("trait of the week: a fixed rotation over Monday-to-Monday weeks", () => {
  const n = config.weeklyTrait.rotation.length;
  assert.strictEqual(Traits.weekOf(MONDAY), 2964);
  assert.strictEqual(Traits.weekOf(MONDAY - 1), 2963);
  assert.strictEqual(Traits.weeklyTrait(2964).id, "fire");
  assert.strictEqual(Traits.weeklyTrait(2964 + n).id, "fire");
  assert.strictEqual(Traits.weeklyTrait(2965).id, "laser");
  assert.strictEqual(Traits.weeklyTrait(2964).startsAt, MONDAY);
  const fire = { attributes: [{ trait_type: "Aura", value: "Burning Aura" }] };
  assert.deepStrictEqual([Traits.weeklyTraitFor(fire, 2964).has, Traits.weeklyTraitFor(fire, 2964).bonus], [true, 1.1]);
  assert.deepStrictEqual([Traits.weeklyTraitFor(fire, 2965).has, Traits.weeklyTraitFor(fire, 2965).bonus], [false, 1]);
  // "any" matches any Accessory value
  const acc = { attributes: [{ trait_type: "Accessory", value: "Coin" }] };
  assert.strictEqual(Traits.weeklyTraitFor(acc, 2964 + 7).has, true);
  assert.strictEqual(Traits.effectiveMultiplier(1.15, 1.1), 1.265);
  assert.strictEqual(Traits.effectiveMultiplier(1.4, 1), 1.4);
});

test("trait of the week: the server applies the bonus to Chogs that have the trait", async () => {
  const { h, alice, signIn, run } = setup();
  const token = await signIn(alice, "Alice");
  const a = await run(token, "1", 1000);
  assert.deepStrictEqual([a.start.weeklyTrait.id, a.start.weeklyTrait.has, a.start.weeklyTrait.bonus], ["fire", true, 1.1]);
  assert.strictEqual(a.fin.multiplier, 1.265);
  assert.strictEqual(a.fin.tierMultiplier, 1.15);
  assert.strictEqual(a.fin.finalScore, 1265);
  const b = await run(token, "2", 1000);
  assert.strictEqual(b.start.weeklyTrait.has, false);
  assert.strictEqual(b.fin.finalScore, 1000);
  const lb = await h.leaderboard();
  assert.strictEqual(lb.entries[0].traitBonus, 1.1);
  assert.strictEqual(lb.entries[0].weeklyTrait, "Fire Auras");
  assert.strictEqual(lb.entries[0].tierMultiplier, 1.15);
});

test("trait of the week: a run taking off after Monday 00:00 uses the new week's trait", async () => {
  const { h, alice, signIn, advance } = setup();
  advance(6 * DAY + 22 * 3600e3 + 59 * 60e3);           // Sunday 23:59 of the Fire week
  const token = await signIn(alice, "Alice");
  const s = await h.runStart({ body: { tokenId: "1" }, token });
  assert.strictEqual(s.weeklyTrait.has, true);
  advance(2 * 60e3);                                     // takes off on Monday: Laser Eyes week
  await h.runFly({ body: { runId: s.runId }, token });
  advance(45e3);
  const fin = await h.runFinish({ body: { runId: s.runId, meters: 1000, durationMs: 44000 }, token });
  assert.strictEqual(fin.weeklyTrait.id, "laser");
  assert.strictEqual(fin.finalScore, 1150);
});

test("career rules: XP, levels and titles", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(Career.xpForLevel), [0, 100, 300, 600, 1000]);
  assert.deepStrictEqual([0, 99, 100, 299, 300, 1000].map(Career.levelFor), [1, 1, 2, 2, 3, 5]);
  assert.strictEqual(Career.runXp(2000, 1), 110);
  let c = Career.empty("7");
  let out = Career.applyRun(c, { meters: 2000, total: 2300, at: 1, pilot: "Alice", ranked: true });
  assert.strictEqual(out.gained, 110);
  assert.strictEqual(out.levelUp, true);
  assert.deepStrictEqual(out.newTitles.map(t => t.id), ["first"]);
  out = Career.applyRun(out.career, { meters: 7000, total: 7000, at: 2, pilot: "Bob", ranked: false });
  assert.deepStrictEqual(out.newTitles.map(t => t.id).sort(), ["belt", "pilots"]);
  c = out.career;
  assert.deepStrictEqual([c.runs, c.flown, c.bestTotal, c.furthestZone, c.pilots.length, c.recent.length], [2, 9000, 7000, 2, 2, 2]);
  assert.deepStrictEqual(Career.applyHonor(c, 10, 1, 3).map(t => t.id).sort(), ["champion", "podium", "top10"]);
  assert.deepStrictEqual(Career.applyHonor(c, 10, 1, 3), []);   // a week counts once
  const v = Career.view(c);
  assert.strictEqual(v.titles.filter(t => t.earnedAt).length, 6);
  assert.strictEqual(v.furthestZoneName, "Asteroid Belt");
});

test("careers: belong to the Chog, follow it to a new owner, and show on the leaderboard", async () => {
  const { h, owners, alice, bob, signIn, run } = setup();
  const ta = await signIn(alice, "Alice");
  const a = await run(ta, "1", 2000);
  assert.strictEqual(a.start.career.level, 1);
  assert.strictEqual(a.fin.career.gained, 110);
  assert.strictEqual(a.fin.career.level, 2);
  assert.strictEqual(a.fin.career.levelUp, true);
  assert.deepStrictEqual(a.fin.career.newTitles.map(t => t.id), ["first"]);
  // Unranked runs count for the career too (no prize pool here, so every run is ranked; the career counts both)
  const lb = await h.leaderboard();
  assert.strictEqual(lb.entries[0].level, 2);
  // Alice sells the Chog to Bob: its career comes along
  owners["1"] = bob.address.toLowerCase();
  const tb = await signIn(bob, "Bobby");
  const b = await run(tb, "1", 1000);
  assert.strictEqual(b.start.career.xp, 110);
  assert.deepStrictEqual(b.fin.career.newTitles.map(t => t.id), ["pilots"]);
  const c = await h.careerGet({ query: { token: "1" } });
  assert.deepStrictEqual([c.runs, c.flown, c.pilots, c.name, c.tier], [2, 3000, 2, "Fire Chog", "Rare"]);
  assert.deepStrictEqual(c.recent.map(r => r.pilot), ["Bobby", "Alice"]);
  assert.strictEqual(c.weeklyTrait.has, true);
  // A Chog that never flew has an empty career
  const e = await h.careerGet({ query: { token: "2" } });
  assert.deepStrictEqual([e.runs, e.level, e.xp], [0, 1, 0]);
  await assert.rejects(h.careerGet({ query: { token: "abc" } }), { status: 400 });
});

test("careers: a top-10 week becomes a weekly honor once the week is over", async () => {
  const { h, alice, signIn, run, advance } = setup();
  const token = await signIn(alice, "Alice");
  await run(token, "1", 3000);
  let c = await h.careerGet({ query: { token: "1" } });
  assert.deepStrictEqual(c.honors, []);                  // the week is still running
  advance(7 * DAY);   // the week is over (careerGet is public: no sign-in needed)
  c = await h.careerGet({ query: { token: "1" } });
  assert.deepStrictEqual(c.honors, [{ week: 2964, rank: 1 }]);
  assert.deepStrictEqual(c.titles.filter(t => t.earnedAt).map(t => t.id).sort(), ["champion", "first", "podium", "top10"]);
  assert.strictEqual(c.title, "Weekly Champion");
});

test("demo runs get the weekly bonus but never write a career", async () => {
  const { h, store, alice, signIn, advance } = setup();
  const token = await signIn(alice, "Alice");
  const demo = require("../js/demo-chogs.js").find(d => Traits.weeklyTraitFor(d.metadata, 2964).has);
  const s = await h.runStart({ body: { tokenId: demo.tokenId, demo: true }, token });
  assert.strictEqual(s.weeklyTrait.has, true);
  await h.runFly({ body: { runId: s.runId }, token });
  advance(45000);
  const fin = await h.runFinish({ body: { runId: s.runId, meters: 1000, durationMs: 44000 }, token });
  assert.strictEqual(fin.finalScore, Traits.computeScore(1000, Traits.effectiveMultiplier(s.multiplier, 1.1)));
  assert.strictEqual(await store.get("career:" + demo.tokenId), null);
});

test("account bests: the wallet's best follows it (at sign-in and with every run) and only goes up", async () => {
  const { h, alice, signIn, run, advance } = setup();
  const { message } = await h.authNonce({ body: { wallet: alice.address } });
  const v = await h.authVerify({ body: { wallet: alice.address, message, signature: await alice.signMessage({ message }) } });
  assert.deepStrictEqual(v.bests, { nft: 0, demo: 0 });
  const token = await signIn(alice, "Alice");
  const a = await run(token, "1", 2000);                       // Fire Chog x1.265 this week: 2,530
  assert.strictEqual(a.fin.bests.nft, a.fin.finalScore);
  const low = await run(token, "2", 1500);                     // a lower run with another Chog doesn't replace it
  assert.strictEqual(low.fin.bests.nft, a.fin.finalScore);
  const b = await run(token, "2", 3000);                       // a higher run with any of the wallet's Chogs does
  assert.strictEqual(b.fin.bests.nft, b.fin.finalScore);
  // Demo runs have their own best
  const demo = require("../js/demo-chogs.js")[0];
  const s = await h.runStart({ body: { tokenId: demo.tokenId, demo: true }, token });
  await h.runFly({ body: { runId: s.runId }, token });
  advance(45000);
  const d = await h.runFinish({ body: { runId: s.runId, meters: 1000, durationMs: 44000 }, token });
  assert.strictEqual(d.bests.demo, d.finalScore);
  assert.strictEqual(d.bests.nft, b.fin.finalScore);
  // Signing in again (say on another device) hands back both bests
  const n2 = await h.authNonce({ body: { wallet: alice.address } });
  const v2 = await h.authVerify({ body: { wallet: alice.address, message: n2.message, signature: await alice.signMessage({ message: n2.message }) } });
  assert.deepStrictEqual(v2.bests, { nft: b.fin.finalScore, demo: d.finalScore });
});
