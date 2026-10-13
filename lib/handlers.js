/*
 * Leaderboard API logic, independent of the HTTP framework so it can be tested directly.
 *
 * Trust model:
 * - Ownership, tier and abilities are read server-side from the contract and metadata.
 * - A wallet signature only proves control of the wallet. It is not proof that a score is real.
 * - Scores are checked for plausibility against server time and the game's speed limits, then
 *   ownership is re-checked. This stops casual cheating, not a determined attacker who fakes
 *   plausible runs. See docs/LEADERBOARD.md.
 */
const crypto = require("crypto");
const config = require("../js/config.js");
const Traits = require("../js/traits.js");

const NONCE_TTL = 600;              // seconds
const AUTH_TTL_MS = 12 * 3600e3;    // sign-in lasts 12 hours
const RUN_TTL = 2 * 3600;           // an unfinished run session expires after 2 hours
const META_TTL = 24 * 3600;
const CLOCK_SLACK_MS = 3000;        // allowed difference between client and server run time
const DISTANCE_SLACK_M = 5;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isAddress = a => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
// Pilot names: 3-16 letters, numbers or underscores, starting with a letter (so a name can't pose as a wallet address)
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;
const isTokenId = t => typeof t === "string" && /^\d{1,78}$/.test(t) && BigInt(t) < 2n ** 256n;
const b64u = buf => Buffer.from(buf).toString("base64url");

function createHandlers({ store, chain, secret, now = () => Date.now() }) {
  if (!secret) throw new Error("SESSION_SECRET is required");

  function sign(payload) {
    const body = b64u(JSON.stringify(payload));
    const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    return body + "." + mac;
  }
  function verifyToken(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) throw new HttpError(401, "Not signed in");
    const [body, mac] = token.split(".");
    const expect = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(mac || ""), b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, "Invalid sign-in");
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp < now()) throw new HttpError(401, "Sign-in expired, please sign in again");
    return p.w;
  }

  async function loadGameplay(tokenId) {
    let meta = await store.get("meta:" + tokenId);
    if (!meta) {
      let uri;
      try { uri = await chain.tokenURI(tokenId); }
      catch (e) { throw new HttpError(502, "Couldn't read this token's metadata link from the contract"); }
      try { meta = await chain.fetchMetadata(uri); }
      catch (e) { throw new HttpError(502, "Couldn't load this token's metadata right now"); }
      await store.set("meta:" + tokenId, meta, META_TTL);
    }
    return { meta, gameplay: Traits.resolveGameplay(meta) };
  }

  async function currentOwner(tokenId) {
    try { return await chain.ownerOf(tokenId); }
    catch (e) { throw new HttpError(502, "Couldn't check ownership on-chain right now"); }
  }

  return {
    // POST { wallet } -> { message }
    async authNonce({ body }) {
      const wallet = body && body.wallet;
      if (!isAddress(wallet)) throw new HttpError(400, "Invalid wallet address");
      const nonce = crypto.randomBytes(16).toString("hex");
      const message = "Chog Dash sign-in\n\nWallet: " + wallet.toLowerCase() + "\nNonce: " + nonce +
        "\nIssued: " + new Date(now()).toISOString() +
        "\n\nThis only proves you control this wallet. It is free and sends no transaction.";
      await store.set("nonce:" + nonce, { wallet: wallet.toLowerCase(), message }, NONCE_TTL);
      return { message };
    },

    // POST { wallet, message, signature } -> { token, expiresAt }
    async authVerify({ body }) {
      const { wallet, message, signature } = body || {};
      if (!isAddress(wallet) || typeof message !== "string" || typeof signature !== "string") throw new HttpError(400, "Missing fields");
      const m = message.match(/\nNonce: ([0-9a-f]{32})\n/);
      const saved = m && await store.get("nonce:" + m[1]);
      if (!saved || saved.message !== message || saved.wallet !== wallet.toLowerCase()) throw new HttpError(401, "Sign-in message expired or unknown");
      await store.del("nonce:" + m[1]);   // one use only
      let ok = false;
      try { ok = await chain.verifySignature({ address: wallet, message, signature }); } catch (e) { ok = false; }
      if (!ok) throw new HttpError(401, "Signature does not match this wallet");
      const expiresAt = now() + AUTH_TTL_MS;
      const username = await store.get("user:" + wallet.toLowerCase());
      return { token: sign({ w: wallet.toLowerCase(), exp: expiresAt }), expiresAt, username: username || null };
    },

    // POST { username } (signed in) -> { username }
    // One name per wallet, unique regardless of letter case. Changing it frees the old name.
    async profileSet({ body, token }) {
      const wallet = verifyToken(token);
      const username = body && typeof body.username === "string" ? body.username.trim() : "";
      if (!USERNAME_RE.test(username)) throw new HttpError(400, "Pilot names are 3 to 16 letters, numbers or underscores, starting with a letter");
      const key = "uname:" + username.toLowerCase();
      const current = await store.get("user:" + wallet);
      if (!(await store.setNX(key, wallet))) {
        if (await store.get(key) !== wallet) throw new HttpError(409, "That pilot name is taken");
      }
      if (current && current.toLowerCase() !== username.toLowerCase()) await store.del("uname:" + current.toLowerCase());
      await store.set("user:" + wallet, username);
      return { username };
    },

    // POST { tokenId } (signed in) -> { runId, tier, multiplier, abilities }
    async runStart({ body, token }) {
      const wallet = verifyToken(token);
      const tokenId = body && String(body.tokenId);
      if (!isTokenId(tokenId)) throw new HttpError(400, "Invalid token ID");
      if (await currentOwner(tokenId) !== wallet) throw new HttpError(403, "This wallet does not own token " + tokenId);
      // The leaderboard shows pilot names, so a ranked run needs one
      if (!(await store.get("user:" + wallet))) throw new HttpError(403, "Choose a pilot name first");
      const { meta, gameplay } = await loadGameplay(tokenId);
      const runId = crypto.randomBytes(16).toString("hex");
      const session = {
        runId, wallet, tokenId,
        name: typeof meta.name === "string" ? meta.name : null,
        tier: gameplay.tier, tierStatus: gameplay.tierStatus, multiplier: gameplay.multiplier,
        laserCharges: (gameplay.abilities.find(a => a.id === "laserEyes") || { charges: 0 }).charges,
        startedAt: now(),
      };
      await store.set("run:" + runId, session, RUN_TTL);
      return { runId, tier: gameplay.tier || "unknown", multiplier: gameplay.multiplier, laserCharges: session.laserCharges };
    },

    // POST { runId, meters, durationMs, laserUsed } (signed in) -> { status, finalScore, multiplier, rank?, reason? }
    async runFinish({ body, token }) {
      const wallet = verifyToken(token);
      const { runId, meters, durationMs, laserUsed } = body || {};
      if (typeof runId !== "string" || !/^[0-9a-f]{32}$/.test(runId)) throw new HttpError(400, "Invalid run");
      const s = await store.get("run:" + runId);
      if (!s) throw new HttpError(404, "Run session not found or expired");
      if (s.wallet !== wallet) throw new HttpError(403, "This run belongs to another wallet");
      if (!(await store.setNX("done:" + runId, 1, RUN_TTL))) throw new HttpError(409, "This run was already submitted");

      const record = {
        runId, wallet, tokenId: s.tokenId, name: s.name, tier: s.tier, multiplier: s.multiplier,
        meters: Number.isInteger(meters) ? meters : null,
        durationMs: Number.isInteger(durationMs) ? durationMs : null,
        finalScore: 0, status: "rejected", reason: null, submittedAt: now(),
      };
      const reject = async reason => {
        record.reason = reason;
        await store.pushRun(record);
        return { status: "rejected", reason, finalScore: 0, multiplier: s.multiplier };
      };

      if (!Number.isInteger(meters) || meters < 0) return reject("Invalid distance");
      if (!Number.isInteger(durationMs) || durationMs <= 0) return reject("Invalid run time");
      const elapsed = now() - s.startedAt;
      if (durationMs > elapsed + CLOCK_SLACK_MS) return reject("Run time is longer than the session existed");
      if (meters > Traits.maxPossibleMeters(durationMs / 1000) + DISTANCE_SLACK_M) return reject("Distance is not possible in that run time");
      if (laserUsed != null && (!Number.isInteger(laserUsed) || laserUsed < 0 || laserUsed > s.laserCharges)) return reject("Laser use does not match this Chog's charges");
      if (await currentOwner(s.tokenId) !== wallet) return reject("Wallet no longer owns this Chog");

      record.status = "validated";
      record.finalScore = Traits.computeScore(meters, s.multiplier);
      await store.pushRun(record);
      await store.updateBest(wallet, record.finalScore, record);   // one entry per player, ranked by total distance
      const rank = await store.rank(wallet);
      return { status: "validated", finalScore: record.finalScore, multiplier: s.multiplier, rank };
    },

    // GET -> { rule, entries: [...] }
    async leaderboard() {
      const top = await store.top(config.leaderboard.size);
      const names = top.length ? await store.mget(top.map(r => "user:" + r.wallet)) : [];
      return {
        rule: "Each player's best total distance (distance x tier multiplier), with any Chog they own.",
        entries: top.map((r, i) => ({
          rank: i + 1, tokenId: r.tokenId, name: r.name, wallet: r.wallet, username: names[i] || null, tier: r.tier,
          totalMeters: r.finalScore, meters: r.meters, multiplier: r.multiplier, score: r.finalScore, submittedAt: r.submittedAt,
        })),
      };
    },
  };
}

module.exports = { createHandlers, HttpError };
