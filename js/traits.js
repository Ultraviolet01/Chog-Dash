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

  // World speed (units/s) at a distance (m): a quick ramp, then a slower climb that never stops.
  function speedAt(meters, cfg) {
    const g = (cfg || config).game, m = Math.max(0, meters);
    const rampEnd = (g.rampSpeed - g.baseSpeed) / g.speedPerMeter;
    if (m <= rampEnd) return g.baseSpeed + m * g.speedPerMeter;
    return g.rampSpeed + g.lateGrowth * Math.sqrt(m - rampEnd);
  }

  // Upper bound on distance (meters) reachable in `seconds`: the speed curve plus every Dash a run could
  // get (one power-up per powerGapMin seconds from firstAt, each worth dashSeconds), plus 2% for frame timing.
  function maxPossibleMeters(seconds, cfg) {
    const g = (cfg || config).game, pk = g.pickups;
    const dt = 0.02;
    let units = 0, dashLeft = 0, nextDash = pk ? pk.firstAt : Infinity;
    for (let t = 0; t < seconds; t += dt) {
      if (pk && t >= nextDash) { dashLeft += pk.dashSeconds; nextDash += pk.powerGapMin; }
      const speed = speedAt(units / g.unitsPerMeter, cfg) * (dashLeft > 0 ? pk.dashSpeedMult : 1);
      units += speed * dt;
      dashLeft = Math.max(0, dashLeft - dt);
    }
    return Math.floor((units * 1.02) / g.unitsPerMeter);
  }

  // Distance (m) an ideal run has covered after `seconds` (no pickups). Built once as a table of
  // whole seconds, extended on demand, and interpolated.
  const distTable = { cfg: null, meters: [0], units: 0, t: 0 };
  function metersAtSeconds(seconds, cfg) {
    const c = cfg || config, g = c.game;
    if (distTable.cfg !== c) { distTable.cfg = c; distTable.meters = [0]; distTable.units = 0; distTable.t = 0; }
    const need = Math.ceil(Math.max(0, seconds)) + 1;
    const dt = 0.02, perSecond = Math.round(1 / dt);
    while (distTable.meters.length <= need) {
      for (let i = 0; i < perSecond; i++) distTable.units += speedAt(distTable.units / g.unitsPerMeter, c) * dt;
      distTable.meters.push(distTable.units / g.unitsPerMeter);
    }
    const s = Math.max(0, seconds), k = Math.floor(s), f = s - k;
    return distTable.meters[k] + (distTable.meters[k + 1] - distTable.meters[k]) * f;
  }

  // Length in minutes of the k-th zone of a run (k = 0, 1, 2 ...): 2, 4, 8, 14, 22, 32 ...
  function zoneMinutes(k, cfg) {
    const g = (cfg || config).game;
    return g.zoneFirstMinutes + g.zoneGrowthMinutes * (k * (k + 1)) / 2;
  }
  function zoneStartSeconds(k, cfg) {
    let s = 0;
    for (let j = 0; j < k; j++) s += zoneMinutes(j, cfg) * 60;
    return s;
  }
  function zoneStartMeters(k, cfg) { return metersAtSeconds(zoneStartSeconds(k, cfg), cfg); }

  // Which zone a distance falls in. Zones repeat in order; loop counts from 1.
  function zoneAt(meters, cfg) {
    const zones = (cfg || config).game.zones;
    const m = Math.max(0, meters);
    let k = 0;
    while (zoneStartMeters(k + 1, cfg) <= m) k++;
    const start = zoneStartMeters(k, cfg);
    return { index: k % zones.length, zone: zones[k % zones.length], loop: Math.floor(k / zones.length) + 1,
      number: k + 1, intoZone: m - start, startMeters: start, endMeters: zoneStartMeters(k + 1, cfg) };
  }

  return { normalizeAttributes, resolveGameplay, computeScore, maxPossibleMeters, matchesRule, zoneAt, zoneMinutes, zoneStartSeconds, zoneStartMeters, metersAtSeconds, speedAt };
});
