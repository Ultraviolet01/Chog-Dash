/*
 * Storage for nonces, run sessions, run records and the leaderboard.
 * - Memory store: local development and tests (data is lost on restart).
 * - Supabase (Postgres): production. Run supabase/schema.sql once, then set SUPABASE_URL and
 *   SUPABASE_SERVICE_ROLE_KEY on the server.
 */
const MAX_RUNS_KEPT = 10000;

function memoryStore(now = () => Date.now()) {
  const kv = new Map();        // key -> { value, exp }
  const runs = [];
  // A leaderboard: one best record per player, ranked by total distance (earlier runs win ties)
  let seq = 0;
  function board() {
    const zset = new Map(), recs = new Map(), at = new Map();   // wallet -> best total, record, when it was set
    return {
      async updateBest(id, score, record) {
        const cur = zset.get(id);
        if (cur != null && cur >= score) return false;
        zset.set(id, score);
        recs.set(id, record);
        at.set(id, ++seq);
        return true;
      },
      async best(id) { return zset.has(id) ? recs.get(id) : null; },
      async rank(id) {
        if (!zset.has(id)) return null;
        const s = zset.get(id);
        return 1 + [...zset.values()].filter(v => v > s).length;
      },
      async top(n) { return [...zset.entries()].sort((a, b) => b[1] - a[1] || at.get(a[0]) - at.get(b[0])).slice(0, n).map(([id]) => recs.get(id)); },
      async remove(id) { zset.delete(id); recs.delete(id); at.delete(id); },
    };
  }
  const weeks = new Map();
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
    // Adds delta to a number (missing = 0) unless the result would go below min: returns the new value, or null
    async add(k, delta, min) {
      const e = live(k), v = (e ? Number(e.value) : 0) + delta;
      if (v < min) return null;
      kv.set(k, { value: v, exp: e ? e.exp : 0 });
      return v;
    },
    async pushRun(record) { runs.unshift(record); if (runs.length > MAX_RUNS_KEPT) runs.length = MAX_RUNS_KEPT; },
    ...board(),
    demo: board(),   // the separate DEMO leaderboard (demo runs only)
    week: w => { if (!weeks.has(w)) weeks.set(w, board()); return weeks.get(w); },   // a week's Chog NFT leaderboard
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
    async add(k, delta, min) { const v = await rpc("chog_kv_add", { p_key: k, p_delta: delta, p_min: min }); return v == null ? null : Number(v); },
    async pushRun(record) { await rpc("chog_run_push", { p_record: record }); },
    ...board("chog_"),
    demo: board("chog_demo_"),   // the separate DEMO leaderboard (demo runs only)
    week: w => weekBoard(w),     // a week's Chog NFT leaderboard (chog_week_leaderboard)
  };
  function weekBoard(w) {
    return {
      async updateBest(id, score, record) { return (await rpc("chog_week_best_update", { p_week: w, p_wallet: id, p_total: score, p_record: record })) === true; },
      async rank(id) { const r = await rpc("chog_week_rank", { p_week: w, p_wallet: id }); return r == null ? null : Number(r); },
      async best(id) { return rpc("chog_week_best", { p_week: w, p_wallet: id }); },
      async top(n) { return rpc("chog_week_top", { p_week: w, p_n: n }); },
      async remove(id) { await rpc("chog_week_remove", { p_week: w, p_wallet: id }); },
    };
  }
  // A leaderboard's functions: chog_best_update, chog_rank ... or chog_demo_best_update, chog_demo_rank ...
  function board(prefix) {
    return {
      async updateBest(id, score, record) { return (await rpc(prefix + "best_update", { p_wallet: id, p_total: score, p_record: record })) === true; },
      async rank(id) { const r = await rpc(prefix + "rank", { p_wallet: id }); return r == null ? null : Number(r); },
      async best(id) { return rpc(prefix + "best", { p_wallet: id }); },
      async top(n) { return rpc(prefix + "top", { p_n: n }); },
    };
  }
}

module.exports = { memoryStore, supabaseStore };
