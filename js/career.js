/*
 * Chog careers: every Chog token builds its own career from the runs flown with it. XP, a level, titles and a run
 * history belong to the token, not the wallet, so they stay with the Chog when it changes hands.
 * Pure functions shared by the browser (window.ChogCareer, also used for demo Chogs on the device) and the server.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./traits.js"));
  else root.ChogCareer = factory(root.ChogTraits);
})(typeof self !== "undefined" ? self : this, function (Traits) {
  const MAX_LEVEL = 50;
  const RECENT = 10;      // runs kept in the history
  const PILOTS = 20;      // pilot names kept

  // XP needed to reach a level: 0, 100, 300, 600, 1,000, 1,500 ... (level L needs 50 x L x (L - 1))
  const xpForLevel = L => 50 * L * (L - 1);
  function levelFor(xp) {
    let L = 1;
    while (L < MAX_LEVEL && xp >= xpForLevel(L + 1)) L++;
    return L;
  }
  function progress(xp) {
    const level = levelFor(xp), start = xpForLevel(level), next = level < MAX_LEVEL ? xpForLevel(level + 1) : null;
    return { level, xp, levelStart: start, nextAt: next, pct: next ? Math.min(100, Math.round(((xp - start) / (next - start)) * 100)) : 100 };
  }
  // XP for one run: 1 per 20 m flown, 50 for every zone reached past the first, 10 for flying at all
  const runXp = (meters, zoneNumber) => Math.floor(Math.max(0, meters) / 20) + 50 * Math.max(0, (zoneNumber || 1) - 1) + 10;

  // Titles a Chog earns. `zone` is the furthest zone number reached (6 = the second loop).
  const TITLES = [
    { id: "first", label: "First Flight", desc: "Flew its first run", test: c => c.runs >= 1 },
    { id: "belt", label: "Asteroid Belt Veteran", desc: "Reached the Asteroid Belt", test: c => c.furthestZone >= 2 },
    { id: "drift", label: "Galactic Drifter", desc: "Reached Galactic Drift", test: c => c.furthestZone >= 3 },
    { id: "deep", label: "Deep Cosmic Diver", desc: "Reached the Deep Cosmic Zone", test: c => c.furthestZone >= 4 },
    { id: "milky", label: "Milky Way Voyager", desc: "Reached the Milky Way", test: c => c.furthestZone >= 5 },
    { id: "loop", label: "Second Lap", desc: "Flew past the Milky Way into a second loop", test: c => c.furthestZone >= 6 },
    { id: "runs25", label: "Frequent Flyer", desc: "Flew 25 runs", test: c => c.runs >= 25 },
    { id: "runs100", label: "Space Veteran", desc: "Flew 100 runs", test: c => c.runs >= 100 },
    { id: "km100", label: "100 km Flown", desc: "Flew 100,000 m in total", test: c => c.flown >= 100000 },
    { id: "km1000", label: "Million Meter Chog", desc: "Flew 1,000,000 m in total", test: c => c.flown >= 1000000 },
    { id: "pilots", label: "Passed Down", desc: "Flown by more than one pilot", test: c => (c.pilots || []).length >= 2 },
    { id: "top10", label: "Weekly Top 10", desc: "Finished a week in the top 10", test: c => (c.honors || []).some(h => h.rank <= 10) },
    { id: "podium", label: "Weekly Podium", desc: "Finished a week in the top 3", test: c => (c.honors || []).some(h => h.rank <= 3) },
    { id: "champion", label: "Weekly Champion", desc: "Won a week", test: c => (c.honors || []).some(h => h.rank === 1) },
  ];
  const titleFor = id => TITLES.find(t => t.id === id) || null;

  function empty(tokenId) {
    return { tokenId: String(tokenId), runs: 0, flown: 0, bestTotal: 0, bestMeters: 0, furthestZone: 0, xp: 0,
      titles: {}, honors: [], checkedWeek: null, recent: [], pilots: [], firstRunAt: null, lastRunAt: null };
  }
  // Awards titles the career now qualifies for; returns the new ones
  function award(c, at) {
    c.titles = c.titles || {};
    const fresh = TITLES.filter(t => !c.titles[t.id] && t.test(c));
    fresh.forEach(t => { c.titles[t.id] = at; });
    return fresh.map(t => ({ id: t.id, label: t.label }));
  }

  // Adds a validated run: { meters, total, at, pilot, ranked }. Returns { career, gained, levelBefore, level, levelUp, newTitles }.
  function applyRun(career, run) {
    const c = Object.assign(empty(career && career.tokenId), JSON.parse(JSON.stringify(career || {})));
    const zone = Traits.zoneAt(run.meters).number, gained = runXp(run.meters, zone), levelBefore = levelFor(c.xp);
    c.runs += 1;
    c.flown += Math.max(0, run.meters);
    c.bestTotal = Math.max(c.bestTotal, run.total || 0);
    c.bestMeters = Math.max(c.bestMeters, run.meters);
    c.furthestZone = Math.max(c.furthestZone, zone);
    c.xp += gained;
    c.firstRunAt = c.firstRunAt || run.at;
    c.lastRunAt = run.at;
    c.recent = [{ at: run.at, meters: run.meters, total: run.total || 0, zone, pilot: run.pilot || null, ranked: !!run.ranked }].concat(c.recent || []).slice(0, RECENT);
    if (run.pilot && !c.pilots.includes(run.pilot)) c.pilots = c.pilots.concat(run.pilot).slice(-PILOTS);
    const level = levelFor(c.xp);
    return { career: c, gained, levelBefore, level, levelUp: level > levelBefore, newTitles: award(c, run.at) };
  }

  // Records a finished week the Chog placed in (rank 1-10). Returns the new titles.
  function applyHonor(career, week, rank, at) {
    if ((career.honors || []).some(h => h.week === week)) return [];
    career.honors = (career.honors || []).concat({ week, rank }).sort((a, b) => b.week - a.week);
    return award(career, at);
  }

  // What the game shows: level, XP bar, stats, titles (earned first), honors, recent runs
  function view(career) {
    const c = Object.assign(empty(career && career.tokenId), career || {});
    return Object.assign(progress(c.xp), {
      tokenId: c.tokenId, runs: c.runs, flown: c.flown, bestTotal: c.bestTotal, bestMeters: c.bestMeters,
      furthestZone: c.furthestZone, furthestZoneName: c.furthestZone ? Traits.zoneAt(Traits.zoneStartMeters(c.furthestZone - 1)).zone.name : null,
      titles: TITLES.map(t => ({ id: t.id, label: t.label, desc: t.desc, earnedAt: (c.titles || {})[t.id] || null })),
      honors: c.honors || [], recent: c.recent || [], pilots: (c.pilots || []).length,
      firstRunAt: c.firstRunAt, lastRunAt: c.lastRunAt,
    });
  }
  // The headline title: the most impressive one earned (shown next to the level)
  const PRESTIGE = ["champion", "podium", "km1000", "loop", "top10", "milky", "runs100", "deep", "km100", "drift", "runs25", "belt", "pilots", "first"];
  function topTitle(career) {
    const got = (career && career.titles) || {};
    const id = PRESTIGE.find(t => got[t]);
    return id ? titleFor(id).label : null;
  }

  return { MAX_LEVEL, TITLES, xpForLevel, levelFor, progress, runXp, empty, applyRun, applyHonor, view, topTitle, titleFor };
});
