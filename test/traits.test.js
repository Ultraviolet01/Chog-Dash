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
  assert.ok(has([A("Eyes", "Laser Eyes")]));
  assert.ok(has([A("eyes", "LASER")]));
  assert.ok(!has([A("Eyes", "Happy")]));
  assert.ok(!has([A("Eyes", "Side Eye")]));
  assert.ok(!has([A("Head", "Laser Crown")]), "laser in another trait must not count");
  assert.ok(!has([]));
});

test("an ability keeps its source trait for display and auditing", () => {
  const a = T.resolveGameplay(meta([A("Eyes", "Laser Eyes")])).abilities[0];
  assert.strictEqual(a.fromTrait, "Eyes");
  assert.strictEqual(a.fromValue, "Laser Eyes");
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
    const gp = T.resolveGameplay(meta([A("Eyes", "Laser Eyes"), A("Tier", tier)]));
    assert.strictEqual(gp.abilities[0].charges, 10, tier);
  }
});

test("score keeps raw distance separate and rounds down", () => {
  assert.strictEqual(T.computeScore(100, 1.15), 114);
  assert.strictEqual(T.computeScore(99, 1.4), 138);
  assert.strictEqual(T.computeScore(0, 1.4), 0);
  assert.strictEqual(T.computeScore(-5, 1), 0);
});

test("distance bound grows with time and stays within top speed", () => {
  const g = config.game;
  let prev = -1;
  for (const s of [1, 10, 30, 60, 300]) {
    const m = T.maxPossibleMeters(s);
    assert.ok(m > prev);
    assert.ok(m <= (g.maxSpeed * g.boostMult * s) / g.unitsPerMeter);
    assert.ok(m >= (g.baseSpeed * s) / g.unitsPerMeter, "a run with no boost must always be allowed");
    prev = m;
  }
});
