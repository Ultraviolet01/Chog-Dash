/*
 * Runs supabase/schema.sql on a real Postgres engine (PGlite, in-process) and drives it through
 * the Supabase store exactly as the server does. The fake fetch below plays Supabase's REST layer:
 * POST /rest/v1/rpc/<function> with JSON arguments -> select <function>(named args), JSON result.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const viem = require("viem");
const { privateKeyToAccount, generatePrivateKey } = require("viem/accounts");
const { supabaseStore } = require("../lib/store.js");
const { createHandlers } = require("../lib/handlers.js");

const TYPES = { p_value: "jsonb", p_record: "jsonb", p_keys: "text[]", p_ttl: "integer", p_total: "integer", p_n: "integer" };

async function setup() {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, "../supabase/schema.sql"), "utf8"));
  const calls = [];
  const fakeFetch = async (url, opts) => {
    const m = url.match(/^https:\/\/proj\.supabase\.co\/rest\/v1\/rpc\/(chog_[a-z_0-9]+)$/);
    assert.ok(m, "unexpected URL " + url);
    assert.strictEqual(opts.method, "POST");
    assert.strictEqual(opts.headers.apikey, "service-key");
    assert.strictEqual(opts.headers.authorization, undefined, "non-JWT keys go in apikey only");
    const args = JSON.parse(opts.body), names = Object.keys(args);
    calls.push(m[1]);
    const sql = "select " + m[1] + "(" + names.map((n, i) => n + " => $" + (i + 1) + "::" + (TYPES[n] || "text")).join(", ") + ") as r";
    const params = names.map(n => (TYPES[n] === "jsonb" ? JSON.stringify(args[n]) : args[n]));
    try {
      const r = await db.query(sql, params);
      return { ok: true, status: 200, text: async () => JSON.stringify(r.rows[0].r) };
    } catch (e) {
      return { ok: false, status: 400, text: async () => JSON.stringify({ message: e.message }) };
    }
  };
  return { db, calls, store: supabaseStore("https://proj.supabase.co/", "service-key", fakeFetch) };
}

test("supabase store: key-value, set-if-missing, expiry and multi-get", async () => {
  const { store } = await setup();
  assert.strictEqual(await store.get("missing"), null);
  await store.set("a", { x: 1 });
  assert.deepStrictEqual(await store.get("a"), { x: 1 });
  await store.set("a", "replaced", 600);
  assert.strictEqual(await store.get("a"), "replaced");
  assert.strictEqual(await store.setNX("once", 1, 600), true);
  assert.strictEqual(await store.setNX("once", 2, 600), false, "second set-if-missing fails");
  assert.strictEqual(await store.get("once"), 1);
  await store.set("u:1", "Alice");
  assert.deepStrictEqual(await store.mget(["u:1", "nope", "a"]), ["Alice", null, "replaced"]);
  await store.del("a");
  assert.strictEqual(await store.get("a"), null);
  // Expiry: a 1-second key disappears, and set-if-missing can then reuse it
  await store.setNX("short", "first", 1);
  await new Promise(r => setTimeout(r, 1200));
  assert.strictEqual(await store.get("short"), null);
  assert.strictEqual(await store.setNX("short", "second", 600), true);
});

test("supabase store: leaderboard keeps the higher total and ranks players", async () => {
  const { store, db } = await setup();
  assert.strictEqual(await store.rank("0xa"), null);
  assert.deepStrictEqual(await store.top(10), []);
  assert.strictEqual(await store.updateBest("0xa", 500, { wallet: "0xa", finalScore: 500 }), true);
  assert.strictEqual(await store.updateBest("0xb", 700, { wallet: "0xb", finalScore: 700 }), true);
  assert.strictEqual(await store.updateBest("0xa", 400, { wallet: "0xa", finalScore: 400 }), false, "lower run does not replace");
  assert.strictEqual(await store.updateBest("0xa", 910, { wallet: "0xa", finalScore: 910 }), true);
  assert.deepStrictEqual((await store.top(10)).map(r => [r.wallet, r.finalScore]), [["0xa", 910], ["0xb", 700]]);
  assert.strictEqual(await store.rank("0xa"), 1);
  assert.strictEqual(await store.rank("0xb"), 2);
  assert.strictEqual((await store.top(1)).length, 1);
  await store.pushRun({ runId: "r1", status: "validated" });
  assert.strictEqual((await db.query("select count(*)::int as n from chog_runs")).rows[0].n, 1);
});

test("supabase store: errors from Supabase are reported, not swallowed", async () => {
  const bad = supabaseStore("https://proj.supabase.co", "k", async () => ({ ok: false, status: 401, text: async () => '{"message":"Invalid API key"}' }));
  await assert.rejects(bad.get("x"), /Storage error 401: Invalid API key/);
  const missing = supabaseStore("https://proj.supabase.co", "k", async () => ({ ok: false, status: 404, text: async () => '{"code":"PGRST202","message":"Could not find the function"}' }));
  await assert.rejects(missing.top(5), /not set up: run supabase\/schema.sql/);
  let headers;
  await supabaseStore("https://p.supabase.co", "eyJlegacy", async (u, o) => { headers = o.headers; return { ok: true, status: 200, text: async () => "null" }; }).get("x");
  assert.strictEqual(headers.authorization, "Bearer eyJlegacy", "legacy JWT keys also sent as bearer");
  const down = supabaseStore("https://proj.supabase.co", "k", async () => { throw new Error("ECONNREFUSED"); });
  await assert.rejects(down.get("x"), /Storage unreachable/);
});

test("full game flow on the Supabase schema: sign in, username, runs, leaderboard", async () => {
  const { store } = await setup();
  let t = 1_000_000;
  const alice = privateKeyToAccount(generatePrivateKey()), bob = privateKeyToAccount(generatePrivateKey());
  const owners = { "1": alice.address.toLowerCase(), "2": bob.address.toLowerCase() };
  const metas = {
    "1": { name: "Chog One", attributes: [{ trait_type: "Tier", value: "Legendary" }] },
    "2": { name: "Chog Two", attributes: [{ trait_type: "Tier", value: "Common" }] },
  };
  const h = createHandlers({
    store, secret: "s", now: () => t,
    chain: {
      ownerOf: async id => owners[id],
      tokenURI: async id => "ipfs://cid/" + id,
      fetchMetadata: async uri => metas[uri.split("/").pop()],
      verifySignature: a => viem.verifyMessage(a),
    },
  });
  async function signIn(acct) {
    const { message } = await h.authNonce({ body: { wallet: acct.address } });
    return h.authVerify({ body: { wallet: acct.address, message, signature: await acct.signMessage({ message }) } });
  }
  const a = await signIn(alice), b = await signIn(bob);
  assert.strictEqual(a.username, null);
  await h.profileSet({ body: { username: "Alice" }, token: a.token });
  await assert.rejects(h.profileSet({ body: { username: "ALICE" }, token: b.token }), /taken/);
  await h.profileSet({ body: { username: "Bob" }, token: b.token });
  assert.strictEqual((await signIn(alice)).username, "Alice", "username comes back on the next sign-in");

  const run = async (who, tokenId, meters) => {
    const s = await h.runStart({ body: { tokenId }, token: who.token });
    t += 30000;
    return h.runFinish({ body: { runId: s.runId, meters, durationMs: 29000 }, token: who.token });
  };
  assert.strictEqual((await run(a, "1", 650)).finalScore, 910);   // Legendary x1.4
  const fb = await run(b, "2", 800);                              // Common x1.0
  assert.deepStrictEqual([fb.status, fb.rank], ["validated", 2]);
  const s = await h.runStart({ body: { tokenId: "1" }, token: a.token });
  t += 30000;
  await h.runFinish({ body: { runId: s.runId, meters: 10, durationMs: 29000 }, token: a.token });
  await assert.rejects(h.runFinish({ body: { runId: s.runId, meters: 10, durationMs: 29000 }, token: a.token }), /already submitted/);

  const lb = await h.leaderboard();
  assert.deepStrictEqual(lb.entries.map(e => [e.rank, e.username, e.totalMeters, e.meters]), [[1, "Alice", 910, 650], [2, "Bob", 800, 800]]);
});

test("supabase store: one player's best record", async () => {
  const { store } = await setup();
  assert.strictEqual(await store.best("0xa"), null);
  await store.updateBest("0xa", 300, { wallet: "0xa", finalScore: 300, image: "ipfs://x/1.webp" });
  assert.deepStrictEqual(await store.best("0xa"), { wallet: "0xa", finalScore: 300, image: "ipfs://x/1.webp" });
});
