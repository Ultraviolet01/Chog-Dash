/*
 * Storage for nonces, run sessions, run records and the leaderboard.
 * - Memory store: local development and tests (data is lost on restart).
 * - Supabase (Postgres): production. Run supabase/schema.sql once, then set SUPABASE_URL and
 *   SUPABASE_SERVICE_ROLE_KEY on the server.
 */
const MAX_RUNS_KEPT = 10000;

function memoryStore(now = () => Date.now()) {
  const kv = new Map();        // key -> { value, exp }
  const zset = new Map();      // wallet -> best distance
  const runs = [];
  const live = k => {
    const e = kv.get(k);
    if (!e) return null;
    if (e.exp && e.exp <= now()) { kv.delete(k); return null; }
    return e;
  };
  return {
    async get(k) { const e = live(k); return e ? e.value : null; },
    async mget(keys) { return keys.map(k => { const e = live(k); return e ? e.value : null; }); },
    async set(k, value, ttlSec) { kv.set(k, { value, exp: ttlSec ? now() + ttlSec * 1000 : 0 }); },
    async setNX(k, value, ttlSec) {
      if (live(k)) return false;
      kv.set(k, { value, exp: ttlSec ? now() + ttlSec * 1000 : 0 });
      return true;
    },
    async del(k) { kv.delete(k); },
    async pushRun(record) { runs.unshift(record); if (runs.length > MAX_RUNS_KEPT) runs.length = MAX_RUNS_KEPT; },
    async updateBest(id, score, record) {
      const cur = zset.get(id);
      if (cur != null && cur >= score) return false;
      zset.set(id, score);
      kv.set("best:" + id, { value: record, exp: 0 });
      return true;
    },
    async best(id) { return zset.has(id) ? kv.get("best:" + id).value : null; },
    async rank(id) {
      if (!zset.has(id)) return null;
      const s = zset.get(id);
      return 1 + [...zset.values()].filter(v => v > s).length;
    },
    async top(n) {
      return [...zset.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([id]) => kv.get("best:" + id).value);
    },
    _runs: runs,
  };
}

// Supabase (Postgres). Every operation is one SQL function from supabase/schema.sql, called through
// Supabase's REST API (POST /rest/v1/rpc/<name>) with the service role key. Server-side only.
function supabaseStore(url, serviceKey, fetchImpl = fetch) {
  const base = url.replace(/\/+$/, "") + "/rest/v1/rpc/";
  async function rpc(name, args) {
    let res;
    try {
      res = await fetchImpl(base + name, {
        method: "POST",
        // New-style secret keys (sb_secret_...) go in the apikey header only; legacy JWT keys also as a bearer token
        headers: Object.assign({ apikey: serviceKey, "content-type": "application/json" },
          serviceKey.startsWith("eyJ") ? { authorization: "Bearer " + serviceKey } : {}),
        body: JSON.stringify(args),
      });
    } catch (e) { throw new Error("Storage unreachable: " + e.message); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!res.ok && data && data.code === "PGRST202") throw new Error("Supabase database is not set up: run supabase/schema.sql in the Supabase SQL editor (" + name + " is missing)");
    if (!res.ok) throw new Error("Storage error " + res.status + ": " + ((data && (data.message || data.hint)) || text.slice(0, 200)));
    return data;
  }
  return {
    async get(k) { return rpc("chog_kv_get", { p_key: k }); },
    async mget(keys) { return rpc("chog_kv_mget", { p_keys: keys }); },
    async set(k, value, ttlSec) { await rpc("chog_kv_set", { p_key: k, p_value: value, p_ttl: ttlSec || 0 }); },
    async setNX(k, value, ttlSec) { return (await rpc("chog_kv_set_nx", { p_key: k, p_value: value, p_ttl: ttlSec || 0 })) === true; },
    async del(k) { await rpc("chog_kv_del", { p_key: k }); },
    async pushRun(record) { await rpc("chog_run_push", { p_record: record }); },
    async updateBest(id, score, record) { return (await rpc("chog_best_update", { p_wallet: id, p_total: score, p_record: record })) === true; },
    async rank(id) { const r = await rpc("chog_rank", { p_wallet: id }); return r == null ? null : Number(r); },
    async best(id) { return rpc("chog_best", { p_wallet: id }); },
    async top(n) { return rpc("chog_top", { p_n: n }); },
  };
}

module.exports = { memoryStore, supabaseStore };
