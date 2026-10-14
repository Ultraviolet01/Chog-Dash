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
  while (Q.dailyFor(t).map(q => q.id).join() !== "d-dust-60,d-horn-1,d-fly-5000") t += DAY;
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
  let state = null, t = Date.UTC(2026, 9, 12, 1);   // Monday of a week whose quest is w-dailies-12
  assert.strictEqual(Q.weeklyFor(t).id, "w-dailies-12");
  const all = Q.runStats({ meters: 30000, stardust: 999, powerups: 9, horns: 3, nearMisses: 50, durationMs: 600000, livesUsed: 0 });
  const done = [];
  for (let i = 0; i < 4; i++) { const r = Q.applyRun(state, Object.assign({}, all, { runs: 3 }), t + i * DAY); state = r.state; done.push(...r.completed); }
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
  for (let d = 1; d <= 20; d++) log = Q.logDay(log, d, d % 4);
  assert.deepStrictEqual(Object.keys(log).map(Number), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.strictEqual(log[20], 0);
});

test("every quest and the streak has a badge", () => {
  const all = Q.allBadges();
  assert.strictEqual(all.length, 14 + 4 + 1);
  all.forEach(b => assert.ok(b.name && b.desc && /^#[0-9a-f]{6}$/.test(b.color) && Q.GLYPH_PATHS[b.glyph], b.id));
  assert.strictEqual(Q.badgeFor("nope"), null);
  assert.strictEqual(Q.runStats({ meters: 500, durationMs: 90000, livesUsed: 1 }).cleanSeconds, 0);
  assert.strictEqual(Q.runStats({ meters: 500, durationMs: 90000, livesUsed: 0 }).cleanSeconds, 90);
});
