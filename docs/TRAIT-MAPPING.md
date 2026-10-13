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
