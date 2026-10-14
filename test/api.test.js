const test = require("node:test");
const assert = require("node:assert");
const { privateKeyToAccount, generatePrivateKey, verifyMessage } = require("viem/accounts");
const viem = require("viem");
const { createHandlers } = require("../lib/handlers.js");
const { memoryStore } = require("../lib/store.js");

function setup() {
  let t = 1_000_000;
  const now = () => t;
  const alice = privateKeyToAccount(generatePrivateKey());
  const bob = privateKeyToAccount(generatePrivateKey());
  const owners = { "1": alice.address.toLowerCase(), "2": alice.address.toLowerCase(), "3": bob.address.toLowerCase() };
  const metadata = {
    "1": { name: "Chog One", attributes: [{ trait_type: "Eyes", value: "Purple laser" }, { trait_type: "Tier", value: "Rare" }] },
    "2": { name: "Chog Two", attributes: [{ trait_type: "Eyes", value: "Happy" }, { trait_type: "Tier", value: "Legendary" }] },
    "3": { name: "Chog Three", attributes: [{ trait_type: "Eyes", value: "Happy" }, { trait_type: "Tier", value: "Common" }] },
  };
  const chain = {
    async ownerOf(id) { if (!owners[id]) throw new Error("revert"); return owners[id]; },
    async tokenURI(id) { return "ipfs://cid/" + id; },
    async balanceOf(w) { return BigInt(Object.values(owners).filter(o => o === w.toLowerCase()).length); },
    async fetchMetadata(uri) { return metadata[uri.split("/").pop()]; },
    verifySignature: args => viem.verifyMessage(args),
  };
  const store = memoryStore(now);
  const h = createHandlers({ store, chain, secret: "test-secret", now });
  // Signs in and, unless name is null, sets a pilot name (needed for ranked runs)
  async function signIn(acct, name) {
    const { message } = await h.authNonce({ body: { wallet: acct.address } });
    const signature = await acct.signMessage({ message });
    const token = (await h.authVerify({ body: { wallet: acct.address, message, signature } })).token;
    if (name !== null && !(await store.get("user:" + acct.address.toLowerCase())))
      await h.profileSet({ body: { username: name || "P" + acct.address.slice(2, 10) }, token });
    return token;
  }
  return { h, store, owners, alice, bob, signIn, advance: ms => { t += ms; }, setTime: v => { t = v; } };
}

const status = async (p) => { try { await p; return 200; } catch (e) { return e.status; } };

test("full flow: sign in, start, finish, leaderboard", async () => {
  const { h, alice, signIn, advance } = setup();
  const token = await signIn(alice);
  const start = await h.runStart({ body: { tokenId: "1" }, token });
  assert.strictEqual(start.tier, "Rare");
  assert.strictEqual(start.multiplier, 1.15);
  assert.strictEqual(start.laserCharges, 10);
  advance(30000);
  const fin = await h.runFinish({ body: { runId: start.runId, meters: 600, durationMs: 29000, laserUsed: 3 }, token });
  assert.strictEqual(fin.status, "validated");
  assert.strictEqual(fin.finalScore, 690);
  assert.strictEqual(fin.rank, 1);
  const lb = await h.leaderboard();
  assert.strictEqual(lb.entries.length, 1);
  assert.deepStrictEqual([lb.entries[0].tokenId, lb.entries[0].meters, lb.entries[0].score], ["1", 600, 690]);
});

test("the server's tier is used, whatever the client sends", async () => {
  const { h, alice, signIn, advance } = setup();
  const token = await signIn(alice);
  const start = await h.runStart({ body: { tokenId: "2", tier: "Common", multiplier: 9 }, token });
  advance(20000);
  const fin = await h.runFinish({ body: { runId: start.runId, meters: 300, durationMs: 19000, multiplier: 9, finalScore: 99999 }, token });
  assert.strictEqual(fin.multiplier, 1.4);
  assert.strictEqual(fin.finalScore, 420);
});

test("one entry per player, ranked by total distance (distance x tier) with any of their Chogs", async () => {
  const { h, alice, bob, signIn, advance } = setup();
  const token = await signIn(alice, "Alice");
  for (const [tokenId, meters] of [["1", 500], ["2", 650], ["1", 200]]) {
    const s = await h.runStart({ body: { tokenId }, token });
    advance(30000);
    await h.runFinish({ body: { runId: s.runId, meters, durationMs: 29000 }, token });
  }
  const tb = await signIn(bob, "Bob");
  const s = await h.runStart({ body: { tokenId: "3" }, token: tb });
  advance(30000);
  await h.runFinish({ body: { runId: s.runId, meters: 700, durationMs: 29000 }, token: tb });
  // Alice: 650 m on a Legendary (x1.4) = 910 beats her 500 m Rare run (575) and Bob's 700 m Common run (700)
  const lb = await h.leaderboard();
  assert.deepStrictEqual(lb.entries.map(e => [e.rank, e.username, e.totalMeters, e.meters, e.tokenId]),
    [[1, "Alice", 910, 650, "2"], [2, "Bob", 700, 700, "3"]]);
});

test("a ranked run needs a pilot name", async () => {
  const { h, alice, signIn } = setup();
  const token = await signIn(alice, null);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "1" }, token })), 403);
  await h.profileSet({ body: { username: "Alice" }, token });
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "1" }, token })), 200);
});

test("cannot start a run with a Chog the wallet does not own", async () => {
  const { h, alice, signIn } = setup();
  const token = await signIn(alice);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "3" }, token })), 403);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "999" }, token })), 502);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "abc" }, token })), 400);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "1" }, token: null })), 401);
});

test("implausible runs are rejected and stored as rejected", async () => {
  const { h, store, alice, signIn, advance } = setup();
  const token = await signIn(alice);
  const cases = [
    [{ meters: 100000, durationMs: 29000 }, /not possible/],
    [{ meters: 100, durationMs: 120000 }, /longer than the session/],
    [{ meters: 100, durationMs: 29000, laserUsed: 11 }, /Laser use/],
    [{ meters: -1, durationMs: 29000 }, /Invalid distance/],
    [{ meters: 1.5, durationMs: 29000 }, /Invalid distance/],
  ];
  for (const [body, re] of cases) {
    const s = await h.runStart({ body: { tokenId: "1" }, token });
    advance(30000);
    const r = await h.runFinish({ body: Object.assign({ runId: s.runId }, body), token });
    assert.strictEqual(r.status, "rejected");
    assert.match(r.reason, re);
  }
  // A Chog without Laser Eyes cannot report laser use
  const s2 = await h.runStart({ body: { tokenId: "2" }, token });
  advance(30000);
  assert.strictEqual((await h.runFinish({ body: { runId: s2.runId, meters: 10, durationMs: 29000, laserUsed: 1 }, token })).status, "rejected");
  assert.strictEqual(store._runs.filter(r => r.status === "rejected").length, cases.length + 1);
  assert.strictEqual((await h.leaderboard()).entries.length, 0);
});

test("a run can only be submitted once, by its own wallet", async () => {
  const { h, alice, bob, signIn, advance } = setup();
  const ta = await signIn(alice), tb = await signIn(bob);
  const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(30000);
  assert.strictEqual(await status(h.runFinish({ body: { runId: s.runId, meters: 10, durationMs: 29000 }, token: tb })), 403);
  await h.runFinish({ body: { runId: s.runId, meters: 10, durationMs: 29000 }, token: ta });
  assert.strictEqual(await status(h.runFinish({ body: { runId: s.runId, meters: 10, durationMs: 29000 }, token: ta })), 409);
});

test("ownership is re-checked when the score is submitted", async () => {
  const { h, owners, alice, bob, signIn, advance } = setup();
  const token = await signIn(alice);
  const s = await h.runStart({ body: { tokenId: "1" }, token });
  owners["1"] = bob.address.toLowerCase();
  advance(30000);
  const r = await h.runFinish({ body: { runId: s.runId, meters: 100, durationMs: 29000 }, token });
  assert.strictEqual(r.status, "rejected");
  assert.match(r.reason, /no longer owns/);
});

test("sign-in rejects wrong signatures, reused nonces and expired tokens", async () => {
  const { h, alice, bob, signIn, advance } = setup();
  const { message } = await h.authNonce({ body: { wallet: alice.address } });
  const wrong = await bob.signMessage({ message });
  assert.strictEqual(await status(h.authVerify({ body: { wallet: alice.address, message, signature: wrong } })), 401);
  // The nonce was consumed by the failed attempt, so even a correct signature now fails
  const right = await alice.signMessage({ message });
  assert.strictEqual(await status(h.authVerify({ body: { wallet: alice.address, message, signature: right } })), 401);
  assert.strictEqual(await status(h.authNonce({ body: { wallet: "nope" } })), 400);
  const token = await signIn(alice);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "1" }, token: token.slice(0, -2) + "xx" })), 401);
  advance(13 * 3600e3);
  assert.strictEqual(await status(h.runStart({ body: { tokenId: "1" }, token })), 401);
});

test("pilot names: set, unique per wallet, shown on the leaderboard", async () => {
  const { h, alice, bob, signIn, advance } = setup();
  const ta = await signIn(alice, null), tb = await signIn(bob, null);
  assert.strictEqual(await status(h.profileSet({ body: { username: "Ace_1" } })), 401);
  for (const bad of ["ab", "1ace", "0xabc", "has space", "x".repeat(17), "", null])
    assert.strictEqual(await status(h.profileSet({ body: { username: bad }, token: ta })), 400, String(bad));
  assert.deepStrictEqual(await h.profileSet({ body: { username: "Ace_1" }, token: ta }), { username: "Ace_1" });
  assert.strictEqual(await status(h.profileSet({ body: { username: "ACE_1" }, token: tb })), 409, "case-insensitive");
  assert.deepStrictEqual(await h.profileSet({ body: { username: "ace_1" }, token: ta }), { username: "ace_1" }, "owner can change case");
  await h.profileSet({ body: { username: "Rocket" }, token: ta });
  assert.deepStrictEqual(await h.profileSet({ body: { username: "Ace_1" }, token: tb }), { username: "Ace_1" }, "old name is freed");

  // Sign-in returns the saved name
  const { message } = await h.authNonce({ body: { wallet: alice.address } });
  const v = await h.authVerify({ body: { wallet: alice.address, message, signature: await alice.signMessage({ message }) } });
  assert.strictEqual(v.username, "Rocket");

  const start = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(30000);
  await h.runFinish({ body: { runId: start.runId, meters: 500, durationMs: 29000 }, token: ta });
  assert.strictEqual((await h.leaderboard()).entries[0].username, "Rocket");
});

test("leaderboard shows the Chog image and, when signed in, the player's own rank", async () => {
  const { h, store, alice, bob, signIn, advance } = setup();
  const ta = await signIn(alice, "Alice"), tb = await signIn(bob, "Bob");
  const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(30000);
  await h.runFinish({ body: { runId: s.runId, meters: 100, durationMs: 29000 }, token: ta });
  const pub = await h.leaderboard({});
  assert.strictEqual(pub.me, null, "no token, no personal row");
  assert.strictEqual(pub.entries[0].image, null, "test metadata has no image");
  const mine = await h.leaderboard({ token: ta });
  assert.deepStrictEqual([mine.me.rank, mine.me.username, mine.me.totalMeters], [1, "Alice", 115]);
  const bobs = await h.leaderboard({ token: tb });
  assert.deepStrictEqual(bobs.me, { rank: null, username: "Bob", wallet: bob.address.toLowerCase() });
  assert.strictEqual((await h.leaderboard({ token: "garbage" })).me, null, "bad token is ignored");
  store.best = async () => { throw new Error("function missing"); };
  const degraded = await h.leaderboard({ token: ta });
  assert.strictEqual(degraded.entries.length, 1, "board still loads if the own-rank lookup fails");
  assert.strictEqual(degraded.me, null);
});

test("quests: holders only, progress from validated runs, badges and streaks", async () => {
  const Quests = require("../js/quests.js");
  const { h, store, owners, alice, bob, signIn, advance, setTime } = setup();
  setTime(Date.UTC(2026, 9, 14, 12));   // a Wednesday
  let ta = await signIn(alice, "Alice");
  assert.strictEqual(await status(h.questsGet({ token: null })), 401);
  const q0 = await h.questsGet({ token: ta });
  assert.strictEqual(q0.daily.length, 3);
  assert.deepStrictEqual(q0.daily.map(q => q.difficulty), ["easy", "medium", "hard"]);
  assert.ok(q0.daily.every(q => q.progress === 0 && !q.done));
  assert.strictEqual(q0.weekly.kind, "weekly");
  assert.strictEqual(q0.streak, 0);
  assert.deepStrictEqual(q0.badges, []);
  assert.strictEqual(q0.dailyResetAt, Date.UTC(2026, 9, 15));
  assert.strictEqual(q0.weeklyResetAt, Date.UTC(2026, 9, 19));

  // A wallet with no Chog is refused (Bob's only Chog moves to Alice)
  owners["3"] = alice.address.toLowerCase();
  const tb = await signIn(bob, "Bob");
  assert.strictEqual(await status(h.questsGet({ token: tb })), 403);

  // Finish a run whose stats complete every daily quest of the day
  const big = { meters: 7000, durationMs: 0, stardust: 400, powerups: 9, horns: 2, nearMisses: 20, livesUsed: 0 };
  const run = async (body, secs) => {
    const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
    advance(secs * 1000 + 1000);
    return h.runFinish({ body: Object.assign({ runId: s.runId }, body, { durationMs: secs * 1000 }), token: ta });
  };
  const r1 = await run(big, 140);
  assert.strictEqual(r1.status, "validated");
  const dailyIds = Quests.dailyFor(Date.UTC(2026, 9, 14, 12)).map(q => q.id);   // all reachable in one run
  assert.deepStrictEqual(r1.quests.completed.filter(id => dailyIds.includes(id)).sort(), dailyIds.slice().sort());
  assert.strictEqual(r1.quests.streak, 1);
  const q1 = await h.questsGet({ token: ta });
  assert.ok(q1.daily.every(q => q.done && q.progress === q.target));
  assert.strictEqual(q1.badges.length, r1.quests.badges.length);
  assert.ok(q1.badges.every(b => b.count === 1 && b.tier === 0 && b.next.at === 5 && b.color && b.glyph), "first completion: Bronze");
  assert.deepStrictEqual(q1.last7.map(d => d.done), [0, 0, 0, 0, 0, 0, 3]);
  assert.strictEqual(q1.players, 1);
  assert.strictEqual(q1.rarity[dailyIds[0]], 100, "the only player has it");
  assert.strictEqual(q1.rarity["w-zone-drift"], 0);

  // Two more days in a row: a 3-day streak badge
  for (const day of [15, 16]) {
    setTime(Date.UTC(2026, 9, day, 12));
    ta = await signIn(alice);   // sign-ins last 12 hours
    const done = [], badges = [];   // 3 runs: some dailies add up over runs ("finish 3 runs today")
    for (let i = 0; i < 3; i++) { const r = await run(big, 140); done.push(...r.quests.completed); badges.push(...r.quests.badges); }
    assert.strictEqual(done.filter(id => Quests.ALL[id].kind === "daily").length, 3, day + ": " + done);
    if (day === 16) assert.ok(badges.some(b => b.id === "streak" && b.tier === 0), "3 days in a row: Streak Bronze");
  }
  const q3 = await h.questsGet({ token: ta });
  assert.strictEqual(q3.streak, 3);
  assert.strictEqual(q3.nextStreakBadge, 7);
  assert.strictEqual(q3.badges.find(b => b.id === "streak").best, 3);
  assert.deepStrictEqual(q3.last7.slice(-3).map(d => d.done), [3, 3, 3]);

  // Pin a badge: only one you've earned; it shows on the leaderboard
  assert.strictEqual(await status(h.badgePin({ body: { id: "w-zone-drift" }, token: ta })), 403);
  assert.strictEqual(await status(h.badgePin({ body: { id: "nope" }, token: ta })), 400);
  assert.deepStrictEqual(await h.badgePin({ body: { id: "streak" }, token: ta }), { pin: "streak" });
  assert.strictEqual((await h.questsGet({ token: ta })).pin, "streak");
  assert.deepStrictEqual((await h.leaderboard()).entries[0].pin, { id: "streak", tier: 0 });
  assert.deepStrictEqual(await h.badgePin({ body: { id: null }, token: ta }), { pin: null });
  assert.strictEqual((await h.leaderboard()).entries[0].pin, null);

  // Missing a day breaks the streak
  setTime(Date.UTC(2026, 9, 18, 12));
  ta = await signIn(alice);
  assert.strictEqual((await h.questsGet({ token: ta })).streak, 0);

  // Leaderboard rows carry the badge count
  const lb = await h.leaderboard();
  assert.strictEqual(lb.entries[0].badges, q3.badges.length);
  await store.del("holder:" + alice.address.toLowerCase());
});

test("quests: reported stats are capped by the run's length and rejected runs count for nothing", async () => {
  const { h, alice, signIn, advance, setTime } = setup();
  setTime(Date.UTC(2026, 9, 14, 12));
  const ta = await signIn(alice, "Alice");
  const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(21000);
  // 20 s run: at most 1 horn, 1 power-up, (4 + 1) x 10 + 50 Stardust, 60 near misses
  const r = await h.runFinish({ body: { runId: s.runId, meters: 300, durationMs: 20000, stardust: 99999, powerups: 50, horns: 9, nearMisses: 999, livesUsed: 0 }, token: ta });
  assert.strictEqual(r.status, "validated");
  const q = await h.questsGet({ token: ta });
  const dust = q.daily.find(x => x.id === "d-dust-150");
  assert.ok(dust.progress <= 100, "stardust capped: " + dust.progress);
  const s2 = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(21000);
  const bad = await h.runFinish({ body: { runId: s2.runId, meters: 100000, durationMs: 20000, stardust: 150 }, token: ta });
  assert.strictEqual(bad.status, "rejected");
  assert.strictEqual(bad.quests, undefined);
});

test("quests: a badge levels up to Silver on its 5th completion, and rarity counts owners", async () => {
  const Quests = require("../js/quests.js");
  const { h, store, alice, bob, signIn, advance, setTime } = setup();
  setTime(Date.UTC(2026, 9, 14, 12));
  const easy = Quests.dailyFor(Date.UTC(2026, 9, 14, 12))[0].id;   // d-fly-1000: one run of 1,000 m
  const ta = await signIn(alice, "Alice");
  await store.set("badges:" + alice.address.toLowerCase(), { [easy]: { count: 4, first: 1 } });
  const s = await h.runStart({ body: { tokenId: "1" }, token: ta });
  advance(61000);
  const r = await h.runFinish({ body: { runId: s.runId, meters: 1200, durationMs: 60000, livesUsed: 1 }, token: ta });
  assert.deepStrictEqual(r.quests.badges, [{ id: easy, tier: 1 }], "Bronze to Silver");
  const tb = await signIn(bob, "Bob");
  const s2 = await h.runStart({ body: { tokenId: "3" }, token: tb });
  advance(61000);
  const rb = await h.runFinish({ body: { runId: s2.runId, meters: 1100, durationMs: 60000, livesUsed: 1 }, token: tb });
  assert.deepStrictEqual(rb.quests.badges, [{ id: easy, tier: 0 }], "Bob's first: Bronze");
  const q = await h.questsGet({ token: ta });
  assert.strictEqual(q.players, 2);
  // Alice's badge was seeded before the counters (only badges first earned through a run are counted), so 1 of 2 players
  assert.strictEqual(q.rarity[easy], 50);
  assert.strictEqual(q.badges.find(b => b.id === easy).tier, 1);
});
