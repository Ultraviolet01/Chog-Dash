const test = require("node:test");
const assert = require("node:assert");
const Meta = require("../js/metadata.js");
const config = require("../js/config.js");

test("ipfs links expand to every gateway in order", () => {
  const urls = Meta.candidateUrls("ipfs://bafyCID/12");
  assert.deepStrictEqual(urls, config.ipfsGateways.map(g => g + "bafyCID/12"));
  assert.deepStrictEqual(Meta.candidateUrls("ipfs://ipfs/bafyCID/12")[0], config.ipfsGateways[0] + "bafyCID/12");
});

test("an https gateway link is tried first, then the others", () => {
  const urls = Meta.candidateUrls("https://some.gateway/ipfs/bafyCID/1.json");
  assert.strictEqual(urls[0], "https://some.gateway/ipfs/bafyCID/1.json");
  assert.ok(urls.includes(config.ipfsGateways[1] + "bafyCID/1.json"));
});

test("plain URLs and empty values", () => {
  assert.deepStrictEqual(Meta.candidateUrls("https://example.com/1.json"), ["https://example.com/1.json"]);
  assert.deepStrictEqual(Meta.candidateUrls(""), []);
  assert.deepStrictEqual(Meta.candidateUrls(null), []);
});

test("metadata falls back to the next gateway when one fails", async t => {
  const calls = [];
  t.mock.method(global, "fetch", async url => {
    calls.push(url);
    if (calls.length === 1) return { ok: false, status: 504 };
    return { ok: true, json: async () => ({ name: "Chog", attributes: [] }) };
  });
  const r = await Meta.fetchJson("ipfs://bafyCID/3");
  assert.strictEqual(r.json.name, "Chog");
  assert.strictEqual(r.url, config.ipfsGateways[1] + "bafyCID/3");
});

test("all gateways failing gives a clear error", async t => {
  t.mock.method(global, "fetch", async () => { throw new Error("network down"); });
  await assert.rejects(Meta.fetchJson("ipfs://bafyCID/3"), /Could not load metadata from any gateway/);
});

test("data: URIs are decoded", async () => {
  const b64 = Buffer.from(JSON.stringify({ name: "On-chain" })).toString("base64");
  assert.strictEqual((await Meta.fetchJson("data:application/json;base64," + b64)).json.name, "On-chain");
});
