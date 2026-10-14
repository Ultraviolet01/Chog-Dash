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
  handlers = createHandlers({ store, chain, secret });
  return handlers;
}

const METHODS = { authNonce: "POST", authVerify: "POST", runStart: "POST", runFinish: "POST", profileSet: "POST", leaderboard: "GET", questsGet: "GET", badgePin: "POST" };

// Returns { status, body } for a parsed request
async function dispatch(name, { method, body, authorization }, h) {
  if (method !== METHODS[name]) return { status: 405, body: { error: "Method not allowed" } };
  try {
    h = h || getHandlers();
    const token = (authorization || "").replace(/^Bearer\s+/i, "") || null;
    return { status: 200, body: await h[name]({ body, token }) };
  } catch (e) {
    if (e.status) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: "Server error" } };
  }
}

// Vercel function: module.exports = route("runStart")
function route(name) {
  return async (req, res) => {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
    const out = await dispatch(name, { method: req.method, body, authorization: req.headers.authorization });
    res.setHeader("cache-control", "no-store");
    res.status(out.status).json(out.body);
  };
}

module.exports = { route, dispatch, getHandlers };
