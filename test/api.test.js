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
    "1": { name: "Chog One", attributes: [{ trait_type: "Eyes", value: "Laser Eyes" }, { trait_type: "Tier", value: "Rare" }] },
    "2": { name: "Chog Two", attributes: [{ trait_type: "Eyes", value: "Happy" }, { trait_type: "Tier", value: "Legendary" }] },
    "3": { name: "Chog Three", attributes: [{ trait_type: "Eyes", value: "Happy" }, { trait_type: "Tier", value: "Common" }] },
  };
  const chain = {
    async ownerOf(id) { if (!owners[id]) throw new Error("revert"); return owners[id]; },
    async tokenURI(id) { return "ipfs://cid/" + id; },
    async fetchMetadata(uri) { return metadata[uri.split("/").pop()]; },
    verifySignature: args => viem.verifyMessage(args),
  };
  const store = memoryStore(now);
  const h = createHandlers({ store, chain, secret: "test-secret", now });
  async function signIn(acct) {
    const { message } = await h.authNonce({ body: { wallet: acct.address } });
    const signature = await acct.signMessage({ message });
    return (await h.authVerify({ body: { wallet: acct.address, message, signature } })).token;
  }
  return { h, store, owners, alice, bob, signIn, advance: ms => { t += ms; } };
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

test("best score per NFT: a lower later run does not replace it", async () => {
  const { h, alice, signIn, advance } = setup();
  const token = await signIn(alice);
  for (const meters of [500, 200]) {
    const s = await h.runStart({ body: { tokenId: "1" }, token });
    advance(30000);
    await h.runFinish({ body: { runId: s.runId, meters, durationMs: 29000 }, token });
  }
  const lb = await h.leaderboard();
  assert.strictEqual(lb.entries.length, 1);
  assert.strictEqual(lb.entries[0].meters, 500);
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
