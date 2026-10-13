/*
 * Storage for nonces, run sessions, run records and the leaderboard.
 * - Memory store: local development and tests (data is lost on restart).
 * - Upstash Redis (REST): production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
const LB_KEY = "lb:token";
const RUNS_KEY = "runs";
const MAX_RUNS_KEPT = 10000;

function memoryStore(now = () => Date.now()) {
  const kv = new Map();        // key -> { value, exp }
  const zset = new Map();      // tokenId -> score
  const runs = [];
  const live = k => {
    const e = kv.get(k);
    if (!e) return null;
    if (e.exp && e.exp <= now()) { kv.delete(k); return null; }
    return e;
  };
  return {
    async get(k) { const e = live(k); return e ? e.value : null; },
    async set(k, value, ttlSec) { kv.set(k, { value, exp: ttlSec ? now() + ttlSec * 1000 : 0 }); },
    async setNX(k, value, ttlSec) {
      if (live(k)) return false;
      kv.set(k, { value, exp: ttlSec ? now() + ttlSec * 1000 : 0 });
      return true;
    },
    async del(k) { kv.delete(k); },
    async pushRun(record) { runs.unshift(record); if (runs.length > MAX_RUNS_KEPT) runs.length = MAX_RUNS_KEPT; },
    async updateBest(tokenId, score, record) {
      const cur = zset.get(tokenId);
      if (cur != null && cur >= score) return false;
      zset.set(tokenId, score);
      kv.set("best:" + tokenId, { value: record, exp: 0 });
      return true;
    },
    async rank(tokenId) {
      if (!zset.has(tokenId)) return null;
      const s = zset.get(tokenId);
      return 1 + [...zset.values()].filter(v => v > s).length;
    },
    async top(n) {
      return [...zset.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([tokenId]) => kv.get("best:" + tokenId).value);
    },
    _runs: runs,
  };
}

function upstashStore(url, token) {
  async function cmd(...args) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(args.map(String)),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error("Storage error: " + (data.error || res.status));
    return data.result;
  }
  const enc = v => JSON.stringify(v);
  const dec = v => (v == null ? null : JSON.parse(v));
  return {
    async get(k) { return dec(await cmd("GET", k)); },
    async set(k, value, ttlSec) { ttlSec ? await cmd("SET", k, enc(value), "EX", ttlSec) : await cmd("SET", k, enc(value)); },
    async setNX(k, value, ttlSec) {
      const r = ttlSec ? await cmd("SET", k, enc(value), "NX", "EX", ttlSec) : await cmd("SET", k, enc(value), "NX");
      return r === "OK";
    },
    async del(k) { await cmd("DEL", k); },
    async pushRun(record) { await cmd("LPUSH", RUNS_KEY, enc(record)); await cmd("LTRIM", RUNS_KEY, 0, MAX_RUNS_KEPT - 1); },
    async updateBest(tokenId, score, record) {
      const changed = await cmd("ZADD", LB_KEY, "GT", "CH", score, tokenId);
      if (Number(changed) > 0) { await cmd("SET", "best:" + tokenId, enc(record)); return true; }
      return false;
    },
    async rank(tokenId) {
      const r = await cmd("ZREVRANK", LB_KEY, tokenId);
      return r == null ? null : Number(r) + 1;
    },
    async top(n) {
      const ids = await cmd("ZREVRANGE", LB_KEY, 0, n - 1);
      if (!ids.length) return [];
      const recs = await cmd("MGET", ...ids.map(id => "best:" + id));
      return recs.map(dec).filter(Boolean);
    },
  };
}

module.exports = { memoryStore, upstashStore };
