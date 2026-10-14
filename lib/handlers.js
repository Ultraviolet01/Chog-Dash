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
const Quests = require("../js/quests.js");

const NONCE_TTL = 600;              // seconds
const AUTH_TTL_MS = 12 * 3600e3;    // sign-in lasts 12 hours
const RUN_TTL = 2 * 3600;           // an unfinished run session expires after 2 hours
const META_TTL = 24 * 3600;
const CLOCK_SLACK_MS = 3000;        // allowed difference between client and server run time
const DISTANCE_SLACK_M = 5;
const HOLDER_TTL = 600;             // a holder check is reused for 10 minutes
const QUEST_TTL = 21 * 24 * 3600;   // quest progress outlives its week, then expires

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

  // Quests are for Chog holders. Cached briefly so opening the quest panel doesn't hit the chain every time.
  async function isHolder(wallet) {
    const cached = await store.get("holder:" + wallet);
    if (cached != null) return cached;
    let n;
    try { n = await chain.balanceOf(wallet); }
    catch (e) { throw new HttpError(502, "Couldn't check your Chogs on-chain right now"); }
    const holder = Number(n) > 0;
    await store.set("holder:" + wallet, holder, HOLDER_TTL);
    return holder;
  }

  // Run stats counted by quests, kept within what the run's length allows (the client reports them,
  // so a stat above its limit is cut down to it). Distance and time were already validated.
  function questStats(body, meters, durationMs) {
    const P = config.game.pickups, sec = durationMs / 1000, live = Math.max(0, sec - P.firstAt);
    const int = v => (Number.isInteger(v) && v >= 0 ? v : 0);
    const horns = Math.min(int(body.horns), Math.floor(live / 80) + 1);
    const limits = {
      horns,
      powerups: Math.floor(live / P.powerGapMin) + 1,
      stardust: (Math.floor(live / 2.5) + 1) * 10 + horns * P.hornStardust,
      nearMisses: Math.ceil(sec * 3),
    };
    const run = { meters, durationMs, livesUsed: body.livesUsed !== 0 };
    Object.keys(limits).forEach(k => { run[k] = Math.min(int(body[k]), limits[k]); });
    return Quests.runStats(run);
  }

  const bump = async key => store.set(key, ((await store.get(key)) || 0) + 1);   // counters for rarity (approximate under races)

  // Applies a validated run to the player's quests, badges, streak, streak lives and daily log. Returns what it earned:
  // { completed: [quest ids], badges: [{ id, tier }] for each badge that reached a new tier, streak, today,
  //   playMsToday, streakDay (the streak's new length if this run made today count), livesEarned }.
  async function progressQuests(wallet, stats) {
    const t = now(), day = Quests.dayNumber(t);
    const keys = ["quest:", "badges:", "streak:", "qlog:"].map(k => k + wallet);
    const [prev, saved, streak, log] = await store.mget(keys);
    const { state, completed } = Quests.applyRun(prev, stats, t);
    const badges = Object.assign({}, saved), tierUps = [], newlyOwned = [];
    const award = (id, change) => {
      const before = Quests.tierIndex(id, badges[id]);
      badges[id] = change(Object.assign({ first: t }, badges[id]));
      const after = Quests.tierIndex(id, badges[id]);
      if (after > before) tierUps.push({ id, tier: after });
      if (before < 0 && after >= 0) newlyOwned.push(id);
    };
    completed.forEach(id => award(id, r => Object.assign(r, { count: (r.count || 0) + 1 })));
    // The streak grows once per day, on the run that makes the day count (3 dailies + 5 minutes flown)
    let newStreak = streak, streakDay = null, livesEarned = 0;
    if (Quests.dayCounts(state) && !(streak && streak.lastDay === day)) {
      newStreak = Quests.bumpStreak(streak, day);
      streakDay = newStreak.count;
      await store.set(keys[2], newStreak);
      if (((badges.streak && badges.streak.best) || 0) < newStreak.count) award("streak", r => Object.assign(r, { best: newStreak.count }));
      livesEarned = Quests.streakLives(newStreak.count);   // every 7th day banks streak lives
      if (livesEarned) await store.set("lives:" + wallet, ((await store.get("lives:" + wallet)) || 0) + livesEarned);
    }
    await store.set(keys[0], state, QUEST_TTL);
    await store.set(keys[3], Quests.logDay(log, day, state));
    if (completed.length || streakDay) await store.set(keys[1], badges);
    // Rarity: how many quest players there are, and how many own each badge
    if (log == null && await store.setNX("qplayer:" + wallet, 1)) await bump("bstat:players");
    for (const id of newlyOwned) await bump("bstat:" + id);
    return { completed, badges: tierUps, streak: Quests.currentStreak(newStreak, t), today: state.done.length,
      playMsToday: state.playMs, streakDay, livesEarned };
  }

  // A badge as the API returns it: its look, its record and tier
  function badgeView(id, rec) {
    const b = Quests.badgeFor(id);
    if (!b) return null;
    const tier = Quests.tierIndex(id, rec), next = Quests.nextTier(id, rec);
    return Object.assign(b, { count: (rec && rec.count) || 0, best: (rec && rec.best) || 0, first: (rec && rec.first) || null, tier,
      next: next && { tier: next.tier.id, at: next.at, have: next.have } });
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
        image: typeof meta.image === "string" ? meta.image : null,   // shown on the leaderboard
        tier: gameplay.tier, tierStatus: gameplay.tierStatus, multiplier: gameplay.multiplier,
        laserCharges: (gameplay.abilities.find(a => a.id === "laserEyes") || { charges: 0 }).charges,
        bankLives: (await store.get("lives:" + wallet)) || 0,   // streak lives this run may spend
        startedAt: now(),
      };
      await store.set("run:" + runId, session, RUN_TTL);
      return { runId, tier: gameplay.tier || "unknown", multiplier: gameplay.multiplier, laserCharges: session.laserCharges, bankLives: session.bankLives };
    },

    // POST { runId, meters, durationMs, laserUsed, bankLivesUsed, quest stats } (signed in) -> { status, finalScore, multiplier, rank?, reason? }
    async runFinish({ body, token }) {
      const wallet = verifyToken(token);
      const { runId, meters, durationMs, laserUsed } = body || {};
      if (typeof runId !== "string" || !/^[0-9a-f]{32}$/.test(runId)) throw new HttpError(400, "Invalid run");
      const s = await store.get("run:" + runId);
      if (!s) throw new HttpError(404, "Run session not found or expired");
      if (s.wallet !== wallet) throw new HttpError(403, "This run belongs to another wallet");
      if (!(await store.setNX("done:" + runId, 1, RUN_TTL))) throw new HttpError(409, "This run was already submitted");
      // Streak lives spent in this run leave the bank, whether or not the score is validated (they were used)
      const bankUsed = Math.min(Number.isInteger(body.bankLivesUsed) && body.bankLivesUsed > 0 ? body.bankLivesUsed : 0, s.bankLives || 0);
      if (bankUsed) await store.set("lives:" + wallet, Math.max(0, ((await store.get("lives:" + wallet)) || 0) - bankUsed));

      const record = {
        runId, wallet, tokenId: s.tokenId, name: s.name, image: s.image || null, tier: s.tier, multiplier: s.multiplier,
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
      // Quest progress never blocks the score: if it fails, the run still counts on the leaderboard
      let quests = null;
      try { quests = await progressQuests(wallet, questStats(body, meters, durationMs)); }
      catch (e) { console.error("quests: progress not saved:", e.message); }
      return { status: "validated", finalScore: record.finalScore, multiplier: s.multiplier, rank, quests };
    },

    // GET (signed in, Chog holders only) -> today's 3 dailies, this week's quest, progress, streak, the last
    // 7 days, badges with tiers, how rare each badge is, and the pinned badge
    async questsGet({ token }) {
      const wallet = verifyToken(token);
      if (!(await isHolder(wallet))) throw new HttpError(403, "Quests are for Chog Genesis holders");
      const t = now(), day = Quests.dayNumber(t), week = Quests.weekNumber(t);
      const ids = Quests.allBadges().map(b => b.id);
      const got = await store.mget(["quest:", "badges:", "streak:", "qlog:", "pin:", "lives:"].map(k => k + wallet)
        .concat(["bstat:players"], ids.map(id => "bstat:" + id)));
      const [state, badges, streak, log, pin, bank, players] = got, owners = got.slice(7);
      const today = state && state.day === day ? state : null, thisWeek = state && state.week === week ? state : null;
      const view = (q, progress, done) => ({ id: q.id, title: q.title, desc: q.desc, difficulty: q.difficulty, kind: q.kind,
        target: q.target, progress: Math.min(q.target, progress || 0), done: !!done, badge: badgeView(q.id, badges && badges[q.id]) });
      const w = Quests.weeklyFor(t);
      const cur = Quests.currentStreak(streak, t);
      const rarity = {};
      ids.forEach((id, k) => { rarity[id] = players ? Math.round((1000 * (owners[k] || 0)) / players) / 10 : 0; });
      return {
        daily: Quests.dailyFor(t).map(q => view(q, today && today.daily[q.id], today && today.done.includes(q.id))),
        weekly: view(w, thisWeek && (w.metric === "dailies" ? thisWeek.dailiesThisWeek : thisWeek.weekly[w.id]), thisWeek && thisWeek.weekDone.includes(w.id)),
        streak: cur,
        nextStreakBadge: Quests.STREAK_TIER_AT.find(n => n > Math.max(cur, (badges && badges.streak && badges.streak.best) || 0)) || null,
        last7: Array.from({ length: 7 }, (_, k) => {
          const d = day - 6 + k, e = log && log[d];
          return Object.assign({ day: d, done: 0, min: 0, counted: false }, typeof e === "number" ? { done: e, counted: e >= 3 } : e);
        }),
        playMsToday: (today && today.playMs) || 0, streakPlayMs: Quests.STREAK_PLAY_MS,
        todayCounted: !!(streak && streak.lastDay === day),
        bestStreak: Math.max(cur, (badges && badges.streak && badges.streak.best) || 0),
        bankLives: bank || 0, nextLives: Quests.nextStreakLives(cur),
        badges: ids.map(id => badgeView(id, badges && badges[id])).filter(b => b.tier >= 0),
        rarity, players: players || 0,
        pin: pin && badges && Quests.tierIndex(pin, badges[pin]) >= 0 ? pin : null,
        dailyResetAt: Quests.nextDayAt(t), weeklyResetAt: Quests.nextWeekAt(t), serverTime: t,
      };
    },

    // POST { id } (signed in) -> { pin }. Pins one of your badges next to your name; { id: null } unpins.
    async badgePin({ body, token }) {
      const wallet = verifyToken(token);
      const id = body && body.id;
      if (id == null) { await store.del("pin:" + wallet); return { pin: null }; }
      if (typeof id !== "string" || !Quests.badgeFor(id)) throw new HttpError(400, "Unknown badge");
      const badges = await store.get("badges:" + wallet);
      if (Quests.tierIndex(id, badges && badges[id]) < 0) throw new HttpError(403, "You haven't earned that badge yet");
      await store.set("pin:" + wallet, id);
      return { pin: id };
    },

    // GET -> { rule, entries: [...], me } . When signed in, `me` is the player's own standing
    // ({ rank, username, totalMeters, ... }, or { rank: null } if they have no validated run yet).
    async leaderboard({ token } = {}) {
      const top = await store.top(config.leaderboard.size);
      const names = top.length ? await store.mget(top.map(r => "user:" + r.wallet)) : [];
      let badgeSets = [], pins = [];
      try {
        if (top.length) {
          const got = await store.mget(top.map(r => "badges:" + r.wallet).concat(top.map(r => "pin:" + r.wallet)));
          badgeSets = got.slice(0, top.length); pins = got.slice(top.length);
        }
      } catch (e) { console.error("leaderboard: badges unavailable:", e.message); }
      const badgeCount = b => Object.keys(b || {}).filter(id => Quests.tierIndex(id, b[id]) >= 0).length;
      const pinOf = (b, id) => (id && b && Quests.tierIndex(id, b[id]) >= 0 ? { id, tier: Quests.tierIndex(id, b[id]) } : null);
      const entry = (r, rank, username, badges, pin) => ({
        rank, tokenId: r.tokenId, name: r.name, image: r.image || null, wallet: r.wallet, username: username || null, tier: r.tier,
        totalMeters: r.finalScore, meters: r.meters, multiplier: r.multiplier, score: r.finalScore, submittedAt: r.submittedAt,
        badges: badgeCount(badges), pin: pinOf(badges, pin),
      });
      let me = null;
      if (token) {
        let wallet = null;
        try { wallet = verifyToken(token); } catch (e) { /* signed out or expired: the board is public anyway */ }
        if (wallet) {
          try {
            const username = await store.get("user:" + wallet);
            const best = await store.best(wallet);
            me = best ? entry(best, await store.rank(wallet), username, ...(await store.mget(["badges:" + wallet, "pin:" + wallet]))) : { rank: null, username: username || null, wallet };
          } catch (e) {
            console.error("leaderboard: own rank unavailable:", e.message);   // the board itself still loads
          }
        }
      }
      return {
        rule: "Each player's best total distance (distance x tier multiplier), with any Chog they own.",
        entries: top.map((r, i) => entry(r, i + 1, names[i], badgeSets[i], pins[i])),
        me,
      };
    },
  };
}

module.exports = { createHandlers, HttpError };
