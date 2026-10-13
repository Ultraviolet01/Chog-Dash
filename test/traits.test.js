const test = require("node:test");
const assert = require("node:assert");
const T = require("../js/traits.js");
const config = require("../js/config.js");

const meta = (attrs, extra) => Object.assign({ name: "Chog #1", attributes: attrs }, extra);
const A = (trait_type, value) => ({ trait_type, value });

test("original trait strings are preserved", () => {
  const { attributes } = T.normalizeAttributes(meta([A(" Eyes ", "Laser Eyes")]));
  assert.strictEqual(attributes[0].trait_type, " Eyes ");
  assert.strictEqual(attributes[0].value, "Laser Eyes");
  assert.strictEqual(attributes[0].key, "eyes");
});

test("malformed metadata is reported, not thrown", () => {
  assert.deepStrictEqual(T.normalizeAttributes(null).problems, ["Metadata is not a JSON object"]);
  assert.deepStrictEqual(T.normalizeAttributes({}).problems, ["Metadata has no attributes list"]);
  const r = T.normalizeAttributes(meta([A("Eyes", "Happy"), { trait_type: "Head" }, "junk"]));
  assert.strictEqual(r.attributes.length, 1);
  assert.strictEqual(r.problems.length, 2);
  const gp = T.resolveGameplay("not json");
  assert.deepStrictEqual(gp.abilities, []);
  assert.strictEqual(gp.multiplier, config.tiers.unknownMultiplier);
});

test("Laser Eyes is granted only by matching Eyes values", () => {
  const has = attrs => T.resolveGameplay(meta(attrs)).abilities.some(a => a.id === "laserEyes");
  ["Purple laser", "fire laser", "Green laser", "cyan laser"].forEach(v => assert.ok(has([A("Eyes", v)]), v));
  assert.ok(has([A("eyes", " GREEN LASER ")]), "case and spacing are ignored");
  assert.ok(!has([A("Eyes", "Plasma visor")]));
  assert.ok(!has([A("Eyes", "Laser")]), "only the audited values count");
  assert.ok(!has([A("Eyes", "Happy")]));
  assert.ok(!has([A("Eyes", "Side Eye")]));
  assert.ok(!has([A("Head", "Laser Crown")]), "laser in another trait must not count");
  assert.ok(!has([]));
});

test("an ability keeps its source trait for display and auditing", () => {
  const a = T.resolveGameplay(meta([A("Eyes", "fire laser")])).abilities[0];
  assert.strictEqual(a.fromTrait, "Eyes");
  assert.strictEqual(a.fromValue, "fire laser");
  assert.strictEqual(a.charges, 10);
});

test("tier multipliers come from the Tier attribute only", () => {
  const tierOf = attrs => T.resolveGameplay(meta(attrs));
  assert.strictEqual(tierOf([A("Tier", "Legendary")]).multiplier, 1.4);
  assert.strictEqual(tierOf([A("Tier", " rare ")]).multiplier, 1.15);
  const unknown = tierOf([A("Tier", "Mythic")]);
  assert.strictEqual(unknown.multiplier, 1.0);
  assert.strictEqual(unknown.tierStatus, "unmapped");
  assert.strictEqual(unknown.tier, "Mythic");
  const missing = T.resolveGameplay({ name: "Legendary Chog", attributes: [] });
  assert.strictEqual(missing.multiplier, 1.0, "tier must not be inferred from the name");
  assert.strictEqual(missing.tierStatus, "missing");
});

test("tier never changes laser charges", () => {
  for (const tier of ["Common", "Uncommon", "Rare", "Epic", "Legendary", "Unknown"]) {
    const gp = T.resolveGameplay(meta([A("Eyes", "cyan laser"), A("Tier", tier)]));
    assert.strictEqual(gp.abilities[0].charges, 10, tier);
  }
});

test("total distance keeps raw distance separate and rounds down", () => {
  assert.strictEqual(T.computeScore(100, 1.15), 115);
  assert.strictEqual(T.computeScore(99, 1.4), 138);
  assert.strictEqual(T.computeScore(0, 1.4), 0);
  assert.strictEqual(T.computeScore(-5, 1), 0);
});

test("distance bound grows with time and allows every honest run", () => {
  const g = config.game;
  let prev = -1;
  for (const s of [1, 10, 30, 60, 300]) {
    const m = T.maxPossibleMeters(s);
    assert.ok(m > prev);
    assert.ok(m >= Math.floor(T.metersAtSeconds(s)), "an ideal run with no pickups must always be allowed");
    assert.ok(m >= (g.baseSpeed * s) / g.unitsPerMeter, "a genuine run at base speed must always be allowed");
    prev = m;
  }
});

test("zone lengths grow 2, 4, 8, 14, 22, 32 minutes and zones loop", () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map(k => T.zoneMinutes(k)), [2, 4, 8, 14, 22, 32, 44]);
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map(k => T.zoneStartSeconds(k) / 60), [0, 2, 6, 14, 28, 50]);
  const at = m => { const z = T.zoneAt(m); return z.zone.id + "@" + z.loop; };
  const start = k => T.zoneStartMeters(k);
  assert.strictEqual(at(0), "outer@1");
  assert.strictEqual(at(start(1) - 1), "outer@1");
  assert.strictEqual(at(start(1)), "belt@1");
  assert.strictEqual(at(start(2) + 1), "drift@1");
  assert.strictEqual(at(start(3) + 1), "deep@1");
  assert.strictEqual(at(start(4) + 1), "milky@1");
  assert.strictEqual(at(start(5) + 1), "outer@2");
  assert.strictEqual(at(start(6) + 1), "belt@2");
  assert.strictEqual(T.zoneAt(start(2) + 120).intoZone, 120);
  assert.deepStrictEqual(config.game.zones.map(z => z.name), ["Outer Space", "Asteroid Belt", "Galactic Drift", "Deep Cosmic Zone", "Milky Way"]);
});

test("time-to-distance matches the game's speed curve", () => {
  const g = config.game;
  // Step the same rule the game uses and compare
  let units = 0, t = 0;
  while (t < 300) { units += T.speedAt(Math.floor(units / g.unitsPerMeter)) * 0.01; t += 0.01; }
  const sim = units / g.unitsPerMeter, formula = T.metersAtSeconds(300);
  assert.ok(Math.abs(sim - formula) / sim < 0.01, sim + " vs " + formula);
  assert.ok(Math.abs(T.metersAtSeconds(120) - T.zoneStartMeters(1)) < 1e-6);
});

test("distance bound allows a run that grabs every Dash", () => {
  const g = config.game, pk = g.pickups;
  // Simulate the fastest legal run: top speed rules plus a Dash every powerGapMin seconds from firstAt
  let units = 0, t = 0, dashLeft = 0, nextDash = pk.firstAt;
  while (t < 300) {
    if (t >= nextDash) { dashLeft += pk.dashSeconds; nextDash += pk.powerGapMin; }
    const base = T.speedAt(Math.floor(units / g.unitsPerMeter));
    units += base * (dashLeft > 0 ? pk.dashSpeedMult : 1) * 0.01;
    dashLeft = Math.max(0, dashLeft - 0.01);
    t += 0.01;
  }
  const meters = Math.floor(units / g.unitsPerMeter);
  assert.ok(meters <= T.maxPossibleMeters(300), meters + " > " + T.maxPossibleMeters(300));
});

test("speed keeps rising with distance, more slowly further on", () => {
  const g = config.game;
  const v = m => T.speedAt(m);
  assert.strictEqual(v(0), g.baseSpeed);
  const rampEnd = (g.rampSpeed - g.baseSpeed) / g.speedPerMeter;
  assert.ok(Math.abs(v(rampEnd) - g.rampSpeed) < 1e-9, "ramp joins the slow climb smoothly");
  let prev = 0;
  for (const m of [100, 1000, rampEnd + 1, 5000, 50000, 200000, 1000000]) { assert.ok(v(m) > prev, "rises at " + m); prev = v(m); }
  // The climb slows down: each extra 10 km adds less speed than the one before
  assert.ok(v(20000) - v(10000) > v(30000) - v(20000));
  // Zone 5 is much faster than the early ramp's top
  assert.ok(v(T.zoneStartMeters(4)) > g.rampSpeed * 2);
});

test("total distance is not rounded down by floating-point error", () => {
  assert.strictEqual(T.computeScore(650, 1.4), 910);
  assert.strictEqual(T.computeScore(100, 1.15), 115);
  assert.strictEqual(T.computeScore(7, 1.05), 7);
  assert.strictEqual(T.computeScore(173, 1.15), 198);
});
