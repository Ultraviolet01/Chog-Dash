# Trait mapping

All gameplay effects are Chog Dash game-design decisions. They are not official Chog Genesis rules.

## How traits are read

- Attributes come from the token's own metadata, loaded from its on-chain `tokenURI`.
- Trait names and values are matched after trimming and lower-casing. The original strings are kept and shown unchanged.
- Malformed or missing metadata never crashes the game, and never borrows another NFT's traits.

## Laser Eyes

- Source trait: `Eyes`.
- Rule: Eyes is exactly one of `Purple laser` (96), `fire laser` (95), `Green laser` (68), `cyan laser` (18). That is 277 of 1,969 tokens.
- Checked against the full collection: these are the only Eyes values with "laser" in them (58 Eyes values in total).
- Visors and glasses (for example `Plasma visor`, `Retro Glass`) do not grant Laser Eyes.
- The 10 one-of-one Legendaries have no Eyes trait, so they get no Laser Eyes.
- Effect: 10 charges per run, no recharge. See README for beam rules.
- To change it, edit `abilities.laserEyes.match.exact` in `js/config.js` and rerun `npm run audit-metadata` to see the new counts.

## Tier multiplier

| Tier | Tokens | Multiplier |
|---|---:|---:|
| Common | 1,279 | 1.00x |
| Uncommon | 590 | 1.05x |
| Rare | 60 | 1.15x |
| Epic | 30 | 1.25x |
| Legendary | 10 | 1.40x |

- Counts are from the full audit. Every token has a Tier, and all five values have a multiplier.

- Read only from the `Tier` attribute, never from the name or the image.
- A missing or unrecognised Tier gets 1.00x and is flagged.
- Tier does not affect laser charges or anything else.

## Unmapped traits

- Any trait or value without a rule has no gameplay effect.
- Head perks (crown, cap, magnet) are not implemented. They need the real Head values first, and a magnet needs a pickup system.
- Background, Skin, Body, Form and the rest are display only.

## Rocket looks (looks only)

These change how the rocket looks. They never change speed, hitbox, pickups or total distance. Code: `js/looks.js`.

| Trait | Tokens | Look |
|---|---:|---|
| Background | 1,869 (all Chogs that aren't Skull, Radioactive or 1:1) | Rocket painted in the background colour, sampled from the Chog's own image, with darker trim in the same colour |
| Base: Skull | 60 | Bone-white rocket, charcoal trim, skull face on the nose, dark purple flame |
| Base: Radioactive | 30 | Glowing green rocket and green exhaust |
| Base: 1:1 | 10 | A unique rocket for each, designed from its artwork (see below) |
| Aura | 974 (22 values) | A trail around and behind the rocket in that aura's style |
| (none of the above) | | Standard cream and orange rocket, also used in practice mode |

### Aura trails

| Aura | Trail |
|---|---|
| Burning Aura, Fiery Aura, Fire | Flames: rising, flickering, yellow to red |
| Aqua Aura | Water droplets falling away |
| Rose Aura, Rose Scent, Pink Mist | Soft pink mist |
| Purple, Light Purple, Violet, Mint, Green Aura, Yellow Aura, White Aura, Royal Blue Aura, Royal Blue | Steady glow in that colour |
| Royal Aura, Clean, Cool Aura | Twinkling sparkles (gold, white, icy blue) |
| Wind | Fast white streaks |
| Smoke | Grey smoke puffs |
| Electric Shock | Jittery electric sparks |

- All 22 Aura values in the collection are mapped. An unknown value gets no trail.

### One-of-one Legendaries

| Chog | Rocket | Trail |
|---|---|---|
| Blaze | Glowing flame orange, red trim | Flames |
| Burning Skully | Bone white, black trim, skull face | Flames |
| Chog Scream | Orange with deep blue trim, blue flame | Orange mist |
| Chogbomination | Pale zombie green, purple trim, toxic glow | Green sparks |
| Frogger | Frog green, yellow-green trim | Green droplets |
| Grim | White with black trim (manga style) | Grey smoke |
| Halo | Cream with gold trim and a floating halo | Gold sparkles |
| Krown | Royal purple with a gold crown on the nose | Purple glow |
| Midas | Solid gold | Gold sparkles |
| Redd | Devil red with horns | Red flames |

- Matched by the name after the dash in the metadata name (for example "CHOG #1373 — Midas"), only when Base is "1:1".
