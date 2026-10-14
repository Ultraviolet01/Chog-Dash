/*
 * Quests (Chog NFT holders only): 3 daily quests (easy, medium, hard) and 1 weekly quest, the same for
 * every player, chosen from the date. Completing a quest earns its badge; finishing all three dailies on
 * consecutive days builds a streak, which earns streak badges. Rewards are badges only.
 *
 * Shared by the browser (display) and the server (the server alone decides progress, from validated runs).
 * Days and weeks change at 00:00 UTC; weeks start on Monday.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./traits.js"));
  else root.ChogQuests = factory(root.ChogTraits);
})(typeof self !== "undefined" ? self : this, function (Traits) {
  // metric: what a run contributes. scope "run": one run must reach the target; "day"/"week": runs add up.
  // Run stats used: meters, zone (1 = Outer Space, 2 = Asteroid Belt, ...), stardust, powerups, horns,
  // nearMisses, cleanSeconds (seconds flown if no life was used, else 0), flySeconds (seconds flown), runs (always 1).
  // Targets are tuned to the speed curve: about 1,000 m at 30 s, 3,000 m at 65 s, 5,000 m at 95 s, and
  // the Asteroid Belt at 2 minutes (6,754 m), Galactic Drift at 6 minutes (25,670 m).
  // Pool sizes 10, 11 and 9 have no common factor, so the same three dailies come back only after 990 days,
  // and each quest returns every 9 to 11 days. Keep the sizes coprime when adding quests.
  const DAILY = {
    easy: [
      { id: "d-fly-1000", title: "Warm-up flight", desc: "Fly 1,000 m in one run", metric: "meters", scope: "run", target: 1000 },
      { id: "d-dust-60", title: "Dust collector", desc: "Collect 60 Stardust today", metric: "stardust", scope: "day", target: 60 },
      { id: "d-power-2", title: "Power hungry", desc: "Grab 2 power-ups today", metric: "powerups", scope: "day", target: 2 },
      { id: "d-runs-3", title: "Frequent flyer", desc: "Finish 3 runs today", metric: "runs", scope: "day", target: 3 },
      { id: "d-near-3", title: "Brush past", desc: "Get 3 near misses in one run", metric: "nearMisses", scope: "run", target: 3 },
      { id: "d-time-3", title: "Flight time", desc: "Fly 3 minutes in total today", metric: "flySeconds", scope: "day", target: 180 },
      { id: "d-total-3000", title: "Short hops", desc: "Fly 3,000 m in total today", metric: "meters", scope: "day", target: 3000 },
      { id: "d-dust-30", title: "Pocket dust", desc: "Collect 30 Stardust in one run", metric: "stardust", scope: "run", target: 30 },
      { id: "d-clean-30", title: "Clean start", desc: "Fly 30 seconds in one run without using a life", metric: "cleanSeconds", scope: "run", target: 30 },
      { id: "d-runs-5", title: "Regular", desc: "Finish 5 runs today", metric: "runs", scope: "day", target: 5 },
    ],
    medium: [
      { id: "d-fly-3000", title: "Long haul", desc: "Fly 3,000 m in one run", metric: "meters", scope: "run", target: 3000 },
      { id: "d-near-8", title: "Close shaves", desc: "Get 8 near misses in one run", metric: "nearMisses", scope: "run", target: 8 },
      { id: "d-horn-1", title: "Golden find", desc: "Collect a Golden Horn today", metric: "horns", scope: "day", target: 1 },
      { id: "d-total-8000", title: "Mileage", desc: "Fly 8,000 m in total today", metric: "meters", scope: "day", target: 8000 },
      { id: "d-clean-60", title: "Steady hands", desc: "Fly 1 minute in one run without using a life", metric: "cleanSeconds", scope: "run", target: 60 },
      { id: "d-power-4", title: "Power surge", desc: "Grab 4 power-ups today", metric: "powerups", scope: "day", target: 4 },
      { id: "d-dust-80", title: "Dust trail", desc: "Collect 80 Stardust in one run", metric: "stardust", scope: "run", target: 80 },
      { id: "d-time-8", title: "Long shift", desc: "Fly 8 minutes in total today", metric: "flySeconds", scope: "day", target: 480 },
      { id: "d-near-15", title: "Daredevil", desc: "Get 15 near misses today", metric: "nearMisses", scope: "day", target: 15 },
      { id: "d-fly-4000", title: "Far out", desc: "Fly 4,000 m in one run", metric: "meters", scope: "run", target: 4000 },
      { id: "d-dust-120", title: "Dust hoarder", desc: "Collect 120 Stardust today", metric: "stardust", scope: "day", target: 120 },
    ],
    hard: [
      { id: "d-zone-belt", title: "Belt runner", desc: "Reach the Asteroid Belt", metric: "zone", scope: "run", target: 2 },
      { id: "d-fly-5000", title: "Deep space", desc: "Fly 5,000 m in one run", metric: "meters", scope: "run", target: 5000 },
      { id: "d-dust-150", title: "Stardust storm", desc: "Collect 150 Stardust in one run", metric: "stardust", scope: "run", target: 150 },
      { id: "d-clean-120", title: "Untouchable", desc: "Fly 2 minutes in one run without using a life", metric: "cleanSeconds", scope: "run", target: 120 },
      { id: "d-power-3", title: "Fully charged", desc: "Grab 3 power-ups in one run", metric: "powerups", scope: "run", target: 3 },
      { id: "d-horn-2", title: "Twin horns", desc: "Collect 2 Golden Horns today", metric: "horns", scope: "day", target: 2 },
      { id: "d-near-15run", title: "Thrill seeker", desc: "Get 15 near misses in one run", metric: "nearMisses", scope: "run", target: 15 },
      { id: "d-total-20000", title: "Endurance", desc: "Fly 20,000 m in total today", metric: "meters", scope: "day", target: 20000 },
      { id: "d-time-15", title: "Marathon session", desc: "Fly 15 minutes in total today", metric: "flySeconds", scope: "day", target: 900 },
    ],
  };
  const WEEKLY = [
    { id: "w-total-50000", title: "Marathon pilot", desc: "Fly 50,000 m in total this week", metric: "meters", scope: "week", target: 50000 },
    { id: "w-zone-drift", title: "Drifter", desc: "Reach Galactic Drift", metric: "zone", scope: "run", target: 3 },
    { id: "w-dust-1000", title: "Star hoarder", desc: "Collect 1,000 Stardust this week", metric: "stardust", scope: "week", target: 1000 },
    { id: "w-dailies-12", title: "Dedicated", desc: "Complete 12 daily quests this week", metric: "dailies", scope: "week", target: 12 },
    { id: "w-time-60", title: "Frequent pilot", desc: "Fly 60 minutes in total this week", metric: "flySeconds", scope: "week", target: 3600 },
    { id: "w-horns-5", title: "Horn hunter", desc: "Collect 5 Golden Horns this week", metric: "horns", scope: "week", target: 5 },
  ];
  const STREAKS = [3, 7, 14, 30];   // Streak badge tiers: days in a row
  // A day counts toward the streak when all 3 dailies are done AND validated Chog runs that day add up to 5 minutes
  const STREAK_PLAY_MS = 5 * 60000;
  // Streak lives: every 7th day in a row banks lives: 7 days -> 1, 14 -> 3, 21 -> 5, 28 -> 7 ... A broken streak
  // starts counting again from day 1, so the rewards can be earned again.
  const streakLives = n => (n >= 7 && n % 7 === 0 ? 2 * (n / 7) - 1 : 0);
  const nextStreakLives = n => { const at = (Math.floor(n / 7) + 1) * 7; return { at, lives: streakLives(at) }; };

  // ---------- Badges ----------
  // One badge per quest, plus one Streak badge. Badges level up through four tiers, like trophies:
  // a quest badge by how many times the quest was completed, the Streak badge by the longest streak.
  // Colour says the quest's difficulty; the frame's shape and metal say the tier.
  const GLYPH = { meters: "arrow", zone: "planet", stardust: "star", powerups: "bolt", horns: "horn", runs: "rocket",
    nearMisses: "swoosh", cleanSeconds: "shield", flySeconds: "clock", dailies: "calendar", streak: "flame" };
  const COLOR = { easy: "#6ee7a8", medium: "#4fa8ff", hard: "#ff5d73", weekly: "#ffcf4d", streak: "#ff7a3d" };
  const TIERS = [
    { id: "bronze", name: "Bronze", metal: "#d08a4e", shape: "circle" },
    { id: "silver", name: "Silver", metal: "#d6dde9", shape: "shield" },
    { id: "gold", name: "Gold", metal: "#ffcf4d", shape: "hexagon" },
    { id: "platinum", name: "Platinum", metal: "#9fe8ff", shape: "star" },
  ];
  const QUEST_TIER_AT = [1, 5, 15, 40];   // completions
  const STREAK_TIER_AT = STREAKS;         // days in a row

  // Drawing data, shared by the page (SVG) and the run card (canvas Path2D).
  // Glyphs use a 24 x 24 box; frames a 48 x 48 box.
  const GLYPH_PATHS = {
    arrow: "M12 20V5M6 11l6-6 6 6",
    planet: "M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10M3 15c3 2 15-3 18-8",
    star: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z",
    bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
    horn: "M5 20c7-1 12-7 13-16M5 20l3-3M18 4c1 4-1 9-5 12",
    rocket: "M12 3c3 2.5 4.5 6 4.5 10l-2 3h-5l-2-3c0-4 1.5-7.5 4.5-10zM12 9.5a1.5 1.5 0 1 1 0 .01M10 19l2 2.5 2-2.5",
    swoosh: "M3 16c6 0 10-4 18-10M3 20c7 0 11-3 18-8",
    shield: "M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM9 12l2 2 4-4",
    calendar: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3",
    clock: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18M12 7v5l3.5 2",
    flame: "M12 3c.5 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4.5 2-6.5 1.2 1 2 2.2 2 3.5 1.5-2.5 1-5.5 1-8z",
  };
  const star = (() => {   // 8-point star
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 17.5 : 23;
      pts.push((24 + Math.cos(a) * r).toFixed(1) + " " + (24 + Math.sin(a) * r).toFixed(1));
    }
    return "M" + pts.join("L") + "z";
  })();
  const SHAPE_PATHS = {
    circle: "M24 3a21 21 0 1 1 0 42a21 21 0 1 1 0-42z",
    shield: "M24 2.5l19 6.5v13c0 11.5-8.5 19.5-19 24C13.5 41.5 5 33.5 5 22V9z",
    hexagon: "M24 1.5l20 11.5v22L24 46.5 4 35V13z",
    star,
  };

  const ALL = {};
  ["easy", "medium", "hard"].forEach(d => DAILY[d].forEach(q => { ALL[q.id] = Object.assign({ kind: "daily", difficulty: d }, q); }));
  WEEKLY.forEach(q => { ALL[q.id] = Object.assign({ kind: "weekly", difficulty: "weekly" }, q); });

  function badgeFor(id) {
    if (id === "streak") return { id, name: "Streak", desc: "Days in a row with all 3 dailies done and 5 minutes flown", color: COLOR.streak, glyph: "flame", kind: "streak" };
    const q = ALL[id];
    return q ? { id, name: q.title, desc: q.desc, color: COLOR[q.difficulty], glyph: GLYPH[q.metric], kind: q.kind } : null;
  }
  function allBadges() { return Object.keys(ALL).map(badgeFor).concat([badgeFor("streak")]); }

  // A badge's stored record: { count } for a quest, { best } for the streak. Returns the tier index (0-3), or -1.
  const tierSteps = id => (id === "streak" ? STREAK_TIER_AT : QUEST_TIER_AT);
  const tierValue = (id, rec) => (rec ? (id === "streak" ? rec.best : rec.count) || 0 : 0);
  function tierIndex(id, rec) {
    const v = tierValue(id, rec);
    return tierSteps(id).filter(n => v >= n).length - 1;
  }
  // What the next tier needs, e.g. { tier: TIERS[1], at: 5, have: 3 }, or null at Platinum
  function nextTier(id, rec) {
    const k = tierIndex(id, rec) + 1, steps = tierSteps(id);
    return k < steps.length ? { tier: TIERS[k], at: steps[k], have: tierValue(id, rec) } : null;
  }
  // Rarity label from the share of quest players who have a badge (0-100)
  function rarity(pct) {
    return pct < 5 ? "Ultra rare" : pct < 15 ? "Very rare" : pct < 35 ? "Rare" : pct < 60 ? "Uncommon" : "Common";
  }

  // ---------- Dates ----------
  const DAY_MS = 86400000;
  const dayNumber = t => Math.floor(t / DAY_MS);                     // UTC day since 1970-01-01
  const weekNumber = t => Math.floor((dayNumber(t) + 3) / 7);       // weeks start on Monday (1970-01-01 was a Thursday)
  const nextDayAt = t => (dayNumber(t) + 1) * DAY_MS;
  const nextWeekAt = t => ((weekNumber(t) + 1) * 7 - 3) * DAY_MS;

  // The same for everyone on a given day or week. Each pool is stepped through in a fixed order, so a
  // quest never repeats on back-to-back days and every quest comes round regularly.
  const at = (list, n) => list[((n % list.length) + list.length) % list.length];
  function dailyFor(t) {
    const d = dayNumber(t);
    return [at(DAILY.easy, d * 3), at(DAILY.medium, d * 4 + 1), at(DAILY.hard, d * 2 + 2)].map(q => ALL[q.id]);
  }
  function weeklyFor(t) { return ALL[at(WEEKLY, weekNumber(t)).id]; }

  // ---------- Progress ----------
  // Turns a validated run into the numbers quests count
  function runStats(run, cfg) {
    const meters = Math.max(0, Math.floor(run.meters || 0));
    return {
      meters,
      zone: Traits.zoneAt(meters, cfg).number,
      stardust: Math.max(0, Math.floor(run.stardust || 0)),
      powerups: Math.max(0, Math.floor(run.powerups || 0)),
      horns: Math.max(0, Math.floor(run.horns || 0)),
      nearMisses: Math.max(0, Math.floor(run.nearMisses || 0)),
      cleanSeconds: run.livesUsed ? 0 : Math.floor((run.durationMs || 0) / 1000),
      flySeconds: Math.floor((run.durationMs || 0) / 1000),
      runs: 1,
      playMs: Math.max(0, Math.floor(run.durationMs || 0)),   // toward the streak's 5 minutes a day
    };
  }

  // state: { day, week, daily: { [id]: progress }, weekly: { [id]: progress }, done: [ids], weekDone: [ids], dailiesThisWeek }
  // Applies one run at time t. Returns { state, completed: [quest ids completed by this run] }.
  function applyRun(prev, stats, t) {
    const day = dayNumber(t), week = weekNumber(t);
    const s = prev && prev.week === week ? JSON.parse(JSON.stringify(prev)) : { week, weekly: {}, weekDone: [], dailiesThisWeek: 0 };
    if (s.day !== day) { s.day = day; s.daily = {}; s.done = []; s.playMs = 0; }
    s.playMs = (s.playMs || 0) + (stats.playMs || 0);
    const completed = [];
    const step = (q, store, doneList) => {
      if (doneList.includes(q.id)) return;
      const v = stats[q.metric] || 0;
      store[q.id] = q.scope === "run" ? Math.max(store[q.id] || 0, v) : (store[q.id] || 0) + v;
      if (store[q.id] >= q.target) { store[q.id] = q.target; doneList.push(q.id); completed.push(q.id); }
    };
    dailyFor(t).forEach(q => step(q, s.daily, s.done));
    const dailiesNow = completed.length;
    s.dailiesThisWeek += dailiesNow;
    const w = weeklyFor(t);
    step(w, s.weekly, s.weekDone);
    if (w.metric === "dailies" && !s.weekDone.includes(w.id)) {   // counts completed dailies, not run stats
      s.weekly[w.id] = Math.min(w.target, s.dailiesThisWeek);
      if (s.weekly[w.id] >= w.target) { s.weekDone.push(w.id); completed.push(w.id); }
    }
    return { state: s, completed };
  }

  // Streak: { lastDay, count }. Call when all three dailies of `day` are done.
  function bumpStreak(prev, day) {
    const p = prev || { lastDay: null, count: 0 };
    if (p.lastDay === day) return p;
    return { lastDay: day, count: p.lastDay === day - 1 ? p.count + 1 : 1 };
  }
  // Does this day count toward the streak? state is applyRun's state for that day.
  const dayCounts = st => !!st && st.done.length === 3 && (st.playMs || 0) >= STREAK_PLAY_MS;
  // Daily log for the 7-day strip: { [day]: { done: dailies done, min: minutes flown, counted } }, last 14 days
  function logDay(log, day, st) {
    const out = {};
    Object.keys(log || {}).forEach(k => { if (Number(k) > day - 14) out[k] = log[k]; });
    out[day] = { done: st.done.length, min: Math.floor((st.playMs || 0) / 60000), counted: dayCounts(st) };
    return out;
  }
  // ---------- One run, and the player's quest screen (shared by the server and the browser demo) ----------
  // rec: { quest, badges, streak, log, lives } as stored for a player (any may be null).
  // Returns { rec: the updated record, result: what the run earned, newlyOwned: badge ids owned for the first time }.
  // result: { completed, badges: [{ id, tier }] that reached a new tier, streak, today, playMsToday, streakDay, livesEarned }
  function progressRun(rec, stats, t) {
    const day = dayNumber(t);
    const { state, completed } = applyRun(rec.quest, stats, t);
    const badges = Object.assign({}, rec.badges), tierUps = [], newlyOwned = [];
    const award = (id, change) => {
      const before = tierIndex(id, badges[id]);
      badges[id] = change(Object.assign({ first: t }, badges[id]));
      const after = tierIndex(id, badges[id]);
      if (after > before) tierUps.push({ id, tier: after });
      if (before < 0 && after >= 0) newlyOwned.push(id);
    };
    completed.forEach(id => award(id, r => Object.assign(r, { count: (r.count || 0) + 1 })));
    // The streak grows once per day, on the run that makes the day count (3 dailies + 5 minutes flown)
    let streak = rec.streak, streakDay = null, livesEarned = 0, lives = rec.lives || 0;
    if (dayCounts(state) && !(streak && streak.lastDay === day)) {
      streak = bumpStreak(streak, day);
      streakDay = streak.count;
      if (((badges.streak && badges.streak.best) || 0) < streak.count) award("streak", r => Object.assign(r, { best: streak.count }));
      livesEarned = streakLives(streak.count);   // every 7th day banks streak lives
      lives += livesEarned;
    }
    return {
      rec: { quest: state, badges, streak, log: logDay(rec.log, day, state), lives },
      result: { completed, badges: tierUps, streak: currentStreak(streak, t), today: state.done.length, playMsToday: state.playMs, streakDay, livesEarned },
      newlyOwned,
    };
  }

  // A badge with its look, record and tier
  function badgeView(id, rec) {
    const b = badgeFor(id);
    if (!b) return null;
    const tier = tierIndex(id, rec), next = nextTier(id, rec);
    return Object.assign(b, { count: (rec && rec.count) || 0, best: (rec && rec.best) || 0, first: (rec && rec.first) || null, tier,
      next: next && { tier: next.tier.id, at: next.at, have: next.have } });
  }

  // The Quests screen for a player. extra: { pin, players, owners: { [badge id]: number of owners } }
  function questView(rec, t, extra) {
    const x = extra || {}, day = dayNumber(t), week = weekNumber(t);
    const state = rec.quest, badges = rec.badges, streak = rec.streak, log = rec.log;
    const today = state && state.day === day ? state : null, thisWeek = state && state.week === week ? state : null;
    const view = (q, progress, done) => ({ id: q.id, title: q.title, desc: q.desc, difficulty: q.difficulty, kind: q.kind,
      target: q.target, progress: Math.min(q.target, progress || 0), done: !!done, badge: badgeView(q.id, badges && badges[q.id]) });
    const w = weeklyFor(t), cur = currentStreak(streak, t), ids = allBadges().map(b => b.id);
    const rarity = {};
    ids.forEach(id => { rarity[id] = x.players ? Math.round((1000 * ((x.owners && x.owners[id]) || 0)) / x.players) / 10 : 0; });
    return {
      daily: dailyFor(t).map(q => view(q, today && today.daily[q.id], today && today.done.includes(q.id))),
      weekly: view(w, thisWeek && (w.metric === "dailies" ? thisWeek.dailiesThisWeek : thisWeek.weekly[w.id]), thisWeek && thisWeek.weekDone.includes(w.id)),
      streak: cur,
      nextStreakBadge: STREAK_TIER_AT.find(n => n > Math.max(cur, (badges && badges.streak && badges.streak.best) || 0)) || null,
      last7: Array.from({ length: 7 }, (_, k) => {
        const d = day - 6 + k, e = log && log[d];
        return Object.assign({ day: d, done: 0, min: 0, counted: false }, typeof e === "number" ? { done: e, counted: e >= 3 } : e);
      }),
      playMsToday: (today && today.playMs) || 0, streakPlayMs: STREAK_PLAY_MS,
      todayCounted: !!(streak && streak.lastDay === day),
      bestStreak: Math.max(cur, (badges && badges.streak && badges.streak.best) || 0),
      bankLives: rec.lives || 0, nextLives: nextStreakLives(cur),
      badges: ids.map(id => badgeView(id, badges && badges[id])).filter(b => b.tier >= 0),
      rarity, players: x.players || 0,
      pin: x.pin && badges && tierIndex(x.pin, badges[x.pin]) >= 0 ? x.pin : null,
      dailyResetAt: nextDayAt(t), weeklyResetAt: nextWeekAt(t), serverTime: t,
    };
  }

  // A streak is broken if yesterday's dailies weren't all done
  const currentStreak = (s, t) => (s && s.lastDay != null && s.lastDay >= dayNumber(t) - 1 ? s.count : 0);

  return { DAILY, WEEKLY, STREAKS, STREAK_PLAY_MS, streakLives, nextStreakLives, dayCounts, ALL, TIERS, QUEST_TIER_AT, STREAK_TIER_AT, GLYPH_PATHS, SHAPE_PATHS,
    badgeFor, allBadges, tierIndex, nextTier, rarity, dayNumber, weekNumber, nextDayAt, nextWeekAt,
    dailyFor, weeklyFor, runStats, applyRun, bumpStreak, logDay, currentStreak, progressRun, badgeView, questView };
});
