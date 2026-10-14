const test = require("node:test");
const assert = require("node:assert");
const Q = require("../js/quests.js");

const DAY = 86400000;
const wed = Date.UTC(2026, 9, 14, 12);

test("days and weeks change at 00:00 UTC, weeks start on Monday", () => {
  assert.strictEqual(Q.nextDayAt(wed), Date.UTC(2026, 9, 15));
  assert.strictEqual(Q.nextWeekAt(wed), Date.UTC(2026, 9, 19));
  assert.strictEqual(Q.weekNumber(Date.UTC(2026, 9, 18, 23, 59)), Q.weekNumber(wed), "Sunday is the same week");
  assert.strictEqual(Q.weekNumber(Date.UTC(2026, 9, 19)), Q.weekNumber(wed) + 1, "Monday starts the next week");
});

test("30 days in a row never repeat the same three dailies", () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const key = Q.dailyFor(wed + i * DAY).map(q => q.id).join();
    assert.ok(!seen.has(key), "day " + i + " repeats " + key);
    seen.add(key);
  }
  // Every daily quest shows up within 11 days
  const ids = new Set();
  for (let i = 0; i < 11; i++) Q.dailyFor(wed + i * DAY).forEach(q => ids.add(q.id));
  assert.strictEqual(ids.size, 10 + 11 + 9);
});

test("one easy, one medium and one hard daily, never repeating on back-to-back days", () => {
  for (let i = 0; i < 60; i++) {
    const t = wed + i * DAY, d = Q.dailyFor(t), next = Q.dailyFor(t + DAY);
    assert.deepStrictEqual(d.map(q => q.difficulty), ["easy", "medium", "hard"]);
    d.forEach((q, k) => assert.notStrictEqual(q.id, next[k].id));
    assert.strictEqual(Q.weeklyFor(t).kind, "weekly");
  }
  assert.deepStrictEqual(Q.dailyFor(wed), Q.dailyFor(wed + 3600e3), "same all day");
});

test("run quests take the best run, day and week quests add up, completed quests stop", () => {
  // A day whose dailies are d-dust-60 (adds up), d-horn-1 (adds up) and d-fly-5000 (best run)
  let t = wed;
  while (Q.dailyFor(t).map(q => q.id).join() !== "d-dust-60,d-horn-1,d-fly-5000" || Q.weekNumber(t + DAY) !== Q.weekNumber(t)) t += DAY;
  const stats = o => Object.assign(Q.runStats({ meters: 0, durationMs: 1000, livesUsed: 0 }), o);
  let r = Q.applyRun(null, stats({ stardust: 40, meters: 3000 }), t);
  assert.deepStrictEqual([r.state.daily["d-dust-60"], r.state.daily["d-fly-5000"]], [40, 3000]);
  assert.deepStrictEqual(r.completed, []);
  r = Q.applyRun(r.state, stats({ stardust: 30, meters: 1000 }), t + 60000);
  assert.strictEqual(r.state.daily["d-dust-60"], 60, "capped at the target");
  assert.strictEqual(r.state.daily["d-fly-5000"], 3000, "one run must reach it");
  assert.deepStrictEqual(r.completed, ["d-dust-60"]);
  r = Q.applyRun(r.state, stats({ stardust: 30, horns: 1, meters: 5100 }), t + 120000);
  assert.deepStrictEqual(r.completed, ["d-horn-1", "d-fly-5000"]);
  assert.strictEqual(r.state.dailiesThisWeek, 3);
  // Next day: dailies reset, the week's count stays
  r = Q.applyRun(r.state, stats({}), t + DAY);
  assert.deepStrictEqual(r.state.done, []);
  assert.strictEqual(r.state.dailiesThisWeek, 3);
});

test("weekly 'complete 12 dailies' counts finished dailies", () => {
  let state = null, t = Date.UTC(2026, 9, 12, 1);   // a Monday; move on to a week whose quest is w-dailies-12
  while (Q.weeklyFor(t).id !== "w-dailies-12") t += 7 * DAY;
  const all = Q.runStats({ meters: 30000, stardust: 999, powerups: 9, horns: 3, nearMisses: 50, durationMs: 1000000, livesUsed: 0 });
  const done = [];
  for (let i = 0; i < 4; i++) { const r = Q.applyRun(state, Object.assign({}, all, { runs: 5 }), t + i * DAY); state = r.state; done.push(...r.completed); }
  assert.strictEqual(state.dailiesThisWeek, 12);
  assert.ok(done.includes("w-dailies-12"));
});

test("streaks grow on consecutive days and restart after a gap", () => {
  let s = null;
  for (let d = 100; d < 130; d++) s = Q.bumpStreak(s, d);
  assert.strictEqual(s.count, 30);
  assert.strictEqual(Q.bumpStreak(s, 129).count, 30, "same day twice counts once");
  assert.strictEqual(Q.bumpStreak(s, 131).count, 1, "a missed day restarts it");
  assert.strictEqual(Q.currentStreak(s, 130 * DAY), 30, "still alive the next day");
  assert.strictEqual(Q.currentStreak(s, 131 * DAY), 0, "broken after a full missed day");
});

test("badges level up through Bronze, Silver, Gold and Platinum", () => {
  const t = id => n => Q.tierIndex(id, id === "streak" ? { best: n } : { count: n });
  assert.deepStrictEqual([0, 1, 4, 5, 14, 15, 39, 40, 99].map(t("d-fly-1000")), [-1, 0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepStrictEqual([2, 3, 6, 7, 14, 30].map(t("streak")), [-1, 0, 0, 1, 2, 3]);
  assert.deepStrictEqual(Q.nextTier("d-fly-1000", { count: 6 }), { tier: Q.TIERS[2], at: 15, have: 6 });
  assert.strictEqual(Q.nextTier("streak", { best: 31 }), null);
  assert.deepStrictEqual(Q.TIERS.map(x => x.shape), ["circle", "shield", "hexagon", "star"]);
  Object.values(Q.SHAPE_PATHS).forEach(d => assert.match(d, /^M[\d. ]/));
  assert.deepStrictEqual([2, 10, 20, 50, 80].map(Q.rarity), ["Ultra rare", "Very rare", "Rare", "Uncommon", "Common"]);
});

test("daily log keeps the last 14 days", () => {
  let log = null;
  for (let d = 1; d <= 20; d++) log = Q.logDay(log, d, { done: [1, 2, 3].slice(0, d % 4), playMs: d * 60000 });
  assert.deepStrictEqual(Object.keys(log).map(Number), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.deepStrictEqual(log[20], { done: 0, min: 20, counted: false });
  assert.deepStrictEqual(log[19], { done: 3, min: 19, counted: true });
});

test("a streak day needs all 3 dailies and 5 minutes flown that day", () => {
  assert.strictEqual(Q.dayCounts({ done: [1, 2, 3], playMs: 299999 }), false, "4:59 is not enough");
  assert.strictEqual(Q.dayCounts({ done: [1, 2, 3], playMs: 300000 }), true);
  assert.strictEqual(Q.dayCounts({ done: [1, 2], playMs: 900000 }), false, "all 3 dailies needed");
  // Minutes add up over the day's runs and reset the next day
  const t = Date.UTC(2026, 9, 14, 12), st = o => Object.assign(Q.runStats({ meters: 0, durationMs: 0, livesUsed: 1 }), o);
  let r = Q.applyRun(null, st({ playMs: 200000 }), t);
  r = Q.applyRun(r.state, st({ playMs: 150000 }), t + 600000);
  assert.strictEqual(r.state.playMs, 350000);
  r = Q.applyRun(r.state, st({ playMs: 1000 }), t + DAY);
  assert.strictEqual(r.state.playMs, 1000);
});

test("streak lives: every 7th day in a row banks 1, 3, 5, 7 ... lives", () => {
  assert.deepStrictEqual([1, 6, 7, 8, 13, 14, 21, 28, 35].map(Q.streakLives), [0, 0, 1, 0, 0, 3, 5, 7, 9]);
  assert.deepStrictEqual(Q.nextStreakLives(0), { at: 7, lives: 1 });
  assert.deepStrictEqual(Q.nextStreakLives(7), { at: 14, lives: 3 });
  assert.deepStrictEqual(Q.nextStreakLives(16), { at: 21, lives: 5 });
});

test("every quest and the streak has a badge", () => {
  const all = Q.allBadges();
  assert.strictEqual(all.length, 10 + 11 + 9 + 6 + 1);
  all.forEach(b => assert.ok(b.name && b.desc && /^#[0-9a-f]{6}$/.test(b.color) && Q.GLYPH_PATHS[b.glyph], b.id));
  assert.strictEqual(Q.badgeFor("nope"), null);
  assert.strictEqual(Q.runStats({ meters: 500, durationMs: 90000, livesUsed: 1 }).cleanSeconds, 0);
  assert.strictEqual(Q.runStats({ meters: 500, durationMs: 90000, livesUsed: 0 }).cleanSeconds, 90);
});
