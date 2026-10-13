/*
 * Wires the handlers to HTTP (Vercel serverless functions and the local dev server).
 */
const { createHandlers } = require("./handlers.js");
const { memoryStore, upstashStore } = require("./store.js");
const { createChain } = require("./chain-server.js");
const config = require("../js/config.js");

let handlers = null;
function getHandlers() {
  if (handlers) return handlers;
  const env = process.env;
  const store = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? upstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
    : memoryStore();
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

const METHODS = { authNonce: "POST", authVerify: "POST", runStart: "POST", runFinish: "POST", leaderboard: "GET" };

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
