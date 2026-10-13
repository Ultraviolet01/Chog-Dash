/*
 * Trait normalisation, ability mapping and tier scoring.
 * Pure functions shared by the browser (window.ChogTraits), the server and the audit script.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else root.ChogTraits = factory(root.ChogConfig);
})(typeof self !== "undefined" ? self : this, function (config) {
  const norm = v => String(v == null ? "" : v).trim().toLowerCase();

  // Returns { attributes: [{ trait_type, value, key, norm }], problems: [] }.
  // The original trait_type and value strings are preserved untouched.
  function normalizeAttributes(metadata) {
    const problems = [];
    if (!metadata || typeof metadata !== "object") {
      return { attributes: [], problems: ["Metadata is not a JSON object"] };
    }
    const raw = metadata.attributes;
    if (!Array.isArray(raw)) {
      return { attributes: [], problems: ["Metadata has no attributes list"] };
    }
    const attributes = [];
    raw.forEach((a, i) => {
      if (!a || typeof a !== "object" || a.trait_type == null || a.value == null) {
        problems.push("Attribute " + i + " is malformed");
        return;
      }
      attributes.push({ trait_type: a.trait_type, value: a.value, key: norm(a.trait_type), norm: norm(a.value) });
    });
    return { attributes, problems };
  }

  function findTrait(attributes, traitName) {
    const key = norm(traitName);
    const found = attributes.filter(a => a.key === key);
    return { attr: found[0] || null, duplicates: found.length > 1 };
  }

  function matchesRule(valueNorm, match) {
    if ((match.exact || []).some(v => norm(v) === valueNorm)) return true;
    return (match.contains || []).some(s => valueNorm.includes(norm(s)));
  }

  // Works out abilities and tier from metadata. Never invents an ability: unmatched -> none.
  function resolveGameplay(metadata, cfg) {
    cfg = cfg || config;
    const { attributes, problems } = normalizeAttributes(metadata);
    const abilities = [];
    const notes = [];

    Object.keys(cfg.abilities).forEach(id => {
      const rule = cfg.abilities[id];
      const { attr, duplicates } = findTrait(attributes, rule.trait);
      if (duplicates) notes.push("More than one " + rule.trait + " attribute; using the first");
      if (attr && matchesRule(attr.norm, rule.match)) {
        abilities.push({ id, label: rule.label, charges: rule.charges, fromTrait: attr.trait_type, fromValue: attr.value });
      }
    });

    const tierAttr = findTrait(attributes, cfg.tiers.trait).attr;
    let tier = null, multiplier = cfg.tiers.unknownMultiplier, tierStatus = "missing";
    if (tierAttr) {
      tier = tierAttr.value;
      if (Object.prototype.hasOwnProperty.call(cfg.tiers.multipliers, tierAttr.norm)) {
        multiplier = cfg.tiers.multipliers[tierAttr.norm];
        tierStatus = "mapped";
      } else {
        tierStatus = "unmapped";
        notes.push("Tier value \"" + tierAttr.value + "\" has no multiplier; using " + multiplier + "x");
      }
    } else {
      notes.push("No " + cfg.tiers.trait + " attribute; using " + multiplier + "x");
    }

    return { attributes, abilities, tier, tierStatus, multiplier, problems, notes };
  }

  function computeScore(meters, multiplier) {
    return Math.floor(Math.max(0, meters) * multiplier);
  }

  // Upper bound on distance (meters) reachable in `seconds`, assuming the player boosts
  // whenever the meter allows. Mirrors the speed and boost logic in js/game.js.
  function maxPossibleMeters(seconds, cfg) {
    const g = (cfg || config).game;
    const dt = 0.05;
    let units = 0, meter = 1, locked = false;
    for (let t = 0; t < seconds; t += dt) {
      const m = Math.floor(units / g.unitsPerMeter);
      const base = Math.min(g.baseSpeed + m * g.speedPerMeter, g.maxSpeed);
      if (meter <= 0) locked = true;
      if (locked && meter > g.boostRelockAt) locked = false;
      const boosting = !locked;
      meter = Math.min(1, Math.max(0, meter + (boosting ? -g.boostDrain : g.boostRefill) * dt));
      units += base * (boosting ? g.boostMult : 1) * dt;   // instant boost: an over-estimate, on purpose
    }
    return Math.floor(units / g.unitsPerMeter);
  }

  return { normalizeAttributes, resolveGameplay, computeScore, maxPossibleMeters, matchesRule };
});
