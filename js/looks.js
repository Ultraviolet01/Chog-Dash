/*
 * Rocket looks from a Chog's traits. Looks only: nothing here changes speed, hitbox or score.
 *
 * - Background: the rocket is painted in the Chog's background colour (sampled from its image).
 * - Aura: a glowing trail behind the rocket in that aura's style.
 * - Base "Skull": bone-white rocket with a dark flame.
 * - Base "Radioactive": glowing green rocket and exhaust.
 * - Base "1:1" (the 10 one-of-one Legendaries): a unique rocket each, designed from its artwork.
 * - Practice mode and Chogs without these traits use the standard rocket.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChogLooks = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const STANDARD = {
    id: "standard", name: "Standard rocket",
    hull: 0xe9e4d8, trim: 0xff7a2f, dark: 0x2b3340, metal: 0.3, glow: 0, glowColor: 0x000000,
    flame: 0xffb84d, exhaust: [1, 0.72, 0.3], extra: null, trail: null,
  };

  // Trail styles: how the particles move and look (see game.js updateTrail)
  //   flame: rising, flickering, yellow to red   water: droplets that fall away   mist: big soft slow puffs
  //   glow: steady soft halo                     wind: fast thin streaks          spark: short jittery flashes
  //   smoke: grey puffs that grow                sparkle: twinkling points
  const AURAS = {
    "burning aura": { style: "flame", color: 0xff6a1a },
    "fiery aura": { style: "flame", color: 0xff3b1f },
    "fire": { style: "flame", color: 0xff8a1f },
    "aqua aura": { style: "water", color: 0x3ad0ff },
    "rose aura": { style: "mist", color: 0xff5f9e },
    "rose scent": { style: "mist", color: 0xff8fbf },
    "pink mist": { style: "mist", color: 0xff9ad5 },
    "purple": { style: "glow", color: 0x9b5cff },
    "light purple": { style: "glow", color: 0xc59bff },
    "violet": { style: "glow", color: 0x8a4dff },
    "mint": { style: "glow", color: 0x5ff5c0 },
    "green aura": { style: "glow", color: 0x3ee86a },
    "yellow aura": { style: "glow", color: 0xffe14d },
    "white aura": { style: "glow", color: 0xffffff },
    "royal blue aura": { style: "glow", color: 0x3d6bff },
    "royal blue": { style: "glow", color: 0x3d6bff },
    "royal aura": { style: "sparkle", color: 0xffd36b },
    "wind": { style: "wind", color: 0xdff4ff },
    "clean": { style: "sparkle", color: 0xffffff },
    "cool aura": { style: "sparkle", color: 0x8fe9ff },
    "smoke": { style: "smoke", color: 0x9a9aa6 },
    "electric shock": { style: "spark", color: 0x7fe8ff },
  };

  // The 10 one-of-one Legendaries, keyed by the name after the dash in their metadata name
  const LEGENDARY = {
    "blaze": { name: "Blaze", hull: 0xff8a1f, trim: 0xc8281e, glow: 0.35, glowColor: 0xff6a00, flame: 0xffd23d, exhaust: [1, 0.55, 0.1], trail: { style: "flame", color: 0xff7a1a } },
    "burning skully": { name: "Burning Skully", hull: 0xf1e6cf, trim: 0x1d1a1f, flame: 0xff6a1a, exhaust: [1, 0.45, 0.1], extra: "skull", trail: { style: "flame", color: 0xff4d1a } },
    "chog scream": { name: "Chog Scream", hull: 0xe8a35a, trim: 0x2d3fa8, flame: 0x5a7dff, exhaust: [0.35, 0.5, 1], trail: { style: "mist", color: 0xff8a3d } },
    "chogbomination": { name: "Chogbomination", hull: 0xd9e8c8, trim: 0x4b2a7a, glow: 0.25, glowColor: 0x3dff3d, flame: 0x7dff3d, exhaust: [0.45, 1, 0.25], trail: { style: "spark", color: 0x6dff3d } },
    "frogger": { name: "Frogger", hull: 0x5fd35a, trim: 0xd8f05a, flame: 0xb8ff6a, exhaust: [0.6, 1, 0.4], trail: { style: "water", color: 0x8fff8a } },
    "grim": { name: "Grim", hull: 0xf2f2f2, trim: 0x111111, dark: 0x111111, flame: 0xd8d8d8, exhaust: [0.75, 0.75, 0.75], trail: { style: "smoke", color: 0xbdbdbd } },
    "halo": { name: "Halo", hull: 0xfff6e0, trim: 0xf2c14e, metal: 0.5, flame: 0xfff1b0, exhaust: [1, 0.92, 0.6], extra: "halo", trail: { style: "sparkle", color: 0xffe8a0 } },
    "krown": { name: "Krown", hull: 0x7a3dd6, trim: 0xf2c230, metal: 0.5, flame: 0xffd84a, exhaust: [1, 0.8, 0.25], extra: "crown", trail: { style: "glow", color: 0xb06bff } },
    "midas": { name: "Midas", hull: 0xf5c518, trim: 0xd99a00, metal: 0.95, glow: 0.12, glowColor: 0xffb000, flame: 0xffe066, exhaust: [1, 0.85, 0.3], trail: { style: "sparkle", color: 0xffd23d } },
    "redd": { name: "Redd", hull: 0xe0242e, trim: 0x7a0c14, flame: 0xff4d4d, exhaust: [1, 0.25, 0.2], extra: "horns", trail: { style: "flame", color: 0xff2a2a } },
  };

  const SKULL = { id: "skull", name: "Skull rocket", hull: 0xeee6d3, trim: 0x23202a, dark: 0x16141a, flame: 0x7a3dcc,
    exhaust: [0.45, 0.2, 0.75], extra: "skull" };
  const RADIOACTIVE = { id: "radioactive", name: "Radioactive rocket", hull: 0x52f25a, trim: 0x1d3b1f, glow: 0.55, glowColor: 0x39ff4a,
    flame: 0xb6ff3a, exhaust: [0.55, 1, 0.2] };

  const toHex = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
  const scale = (c, k) => c.map(v => Math.max(0, Math.min(255, v * k)));

  function traitValue(attributes, name) {
    const a = (attributes || []).find(x => String(x.trait_type).trim().toLowerCase() === name);
    return a == null || a.value == null ? "" : String(a.value).trim();
  }

  // attributes: the token's metadata attributes. meta: { name } (for the 1:1s).
  // backgroundRgb: [r, g, b] sampled from the image, or null.
  function rocketLook(attributes, meta, backgroundRgb) {
    const base = traitValue(attributes, "base").toLowerCase();
    const auraValue = traitValue(attributes, "aura");
    const aura = AURAS[auraValue.toLowerCase()];
    const trail = aura ? Object.assign({ name: auraValue }, aura) : null;

    if (base === "1:1") {
      const m = String((meta && meta.name) || "").match(/[—–-]\s*(.+)$/);
      const key = m ? m[1].trim().toLowerCase() : "";
      const L = LEGENDARY[key];
      if (L) {
        return Object.assign({}, STANDARD, L, { id: "legendary:" + key, name: L.name + " one-of-one rocket",
          trail: Object.assign({ name: L.name }, L.trail) });
      }
    }
    if (base === "skull") return Object.assign({}, STANDARD, SKULL, { trail });
    if (base === "radioactive") return Object.assign({}, STANDARD, RADIOACTIVE, { trail });

    const look = Object.assign({}, STANDARD, { trail });
    if (backgroundRgb) {
      // Paint in the background colour, with darker trim of the same colour so every Chog's rocket matches it
      look.id = "painted";
      look.name = traitValue(attributes, "background") ? traitValue(attributes, "background") + " rocket" : "Painted rocket";
      look.hull = toHex(backgroundRgb);
      look.trim = toHex(scale(backgroundRgb, 0.55));
    }
    return look;
  }

  return { STANDARD, AURAS, LEGENDARY, rocketLook, traitValue };
});
