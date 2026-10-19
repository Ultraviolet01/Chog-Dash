/*
 * Wires the handlers to HTTP (Vercel serverless functions and the local dev server).
 */
const { createHandlers } = require("./handlers.js");
const { memoryStore, supabaseStore } = require("./store.js");
const { createChain } = require("./chain-server.js");
const config = require("../js/config.js");

let handlers = null;
function getHandlers() {
  if (handlers) return handlers;
  const env = process.env;
  let store;
  // Also accepts the names Supabase's own templates use (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)
  const sbUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (sbUrl && sbKey) store = supabaseStore(sbUrl, sbKey);
  else if (env.VERCEL || env.NODE_ENV === "production") throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set");
  else { store = memoryStore(); console.warn("Supabase not configured: using in-memory storage (lost on restart)"); }
  let secret = env.SESSION_SECRET;
  if (!secret) {
    if (env.VERCEL || env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
    secret = "dev-only-secret";
    console.warn("SESSION_SECRET not set: using an insecure development secret");
  }
  const chain = createChain(env.MONAD_RPC_URL || config.collection.rpcUrls[0]);
  // The prize pool: its owner's wallet (POOL_ADMIN), and optionally the contract address (otherwise the owner
  // registers it from the admin page after deploying)
  handlers = createHandlers({ store, chain, secret, poolAdmin: env.POOL_ADMIN, poolAddress: env.POOL_ADDRESS });
  return handlers;
}

const METHODS = { authNonce: "POST", authVerify: "POST", runStart: "POST", runFly: "POST", runFinish: "POST", profileSet: "POST",
  leaderboard: "GET", questsGet: "GET", badgePin: "POST", demoLeaderboard: "GET",
  careerGet: "GET", pool: "GET", ticketQuote: "POST", ticketClaim: "POST", poolResults: "GET", poolRegister: "POST", poolDisqualify: "POST" };
// URL path -> handler. All of /api/* is served by one function (api/router.js; Vercel's free plan allows 12)
const ROUTES = {
  "/api/auth/nonce": "authNonce", "/api/auth/verify": "authVerify",
  "/api/run/start": "runStart", "/api/run/fly": "runFly", "/api/run/finish": "runFinish", "/api/leaderboard": "leaderboard",
  "/api/profile": "profileSet", "/api/quests": "questsGet", "/api/badge/pin": "badgePin", "/api/demo-leaderboard": "demoLeaderboard",
  "/api/career": "careerGet",
  "/api/pool": "pool", "/api/pool/results": "poolResults", "/api/pool/register": "poolRegister", "/api/pool/disqualify": "poolDisqualify",
  "/api/tickets/quote": "ticketQuote", "/api/tickets/claim": "ticketClaim",
};

// Returns { status, body } for a parsed request
async function dispatch(name, { method, body, authorization, query }, h) {
  if (!METHODS[name]) return { status: 404, body: { error: "Not found" } };
  if (method !== METHODS[name]) return { status: 405, body: { error: "Method not allowed" } };
  try {
    h = h || getHandlers();
    const token = (authorization || "").replace(/^Bearer\s+/i, "") || null;
    return { status: 200, body: await h[name]({ body, token, query: query || {} }) };
  } catch (e) {
    if (e.status) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: "Server error" } };
  }
}

// The Vercel function for every /api route (api/router.js; vercel.json rewrites /api/<route> to /api/router?route=<route>)
async function apiRoute(req, res) {
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const url = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(url.searchParams);
  const pathname = query.route != null ? "/api/" + String(query.route).replace(/^\/+/, "") : url.pathname;
  delete query.route;
  const out = await dispatch(ROUTES[pathname.replace(/\/+$/, "")], { method: req.method, body, authorization: req.headers.authorization, query });
  res.setHeader("cache-control", "no-store");
  res.status(out.status).json(out.body);
}

module.exports = { apiRoute, dispatch, getHandlers, ROUTES };
