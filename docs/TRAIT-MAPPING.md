# Trait mapping

All gameplay effects are Chog Dash game-design decisions. They are not official Chog Genesis rules.

## How traits are read

- Attributes come from the token's own metadata, loaded from its on-chain `tokenURI`.
- Trait names and values are matched after trimming and lower-casing. The original strings are kept and shown unchanged.
- Malformed or missing metadata never crashes the game, and never borrows another NFT's traits.

## Laser Eyes

- Source trait: `Eyes`.
- Current rule (provisional): any Eyes value containing "laser".
- Effect: 10 charges per run, no recharge. See README for beam rules.
- Before launch: run `npm run audit-metadata`, review the Eyes table in `docs/TRAIT-AUDIT.md`, and replace the rule with an explicit list in `js/config.js` (`abilities.laserEyes.match.exact`) if anything is wrong.

## Tier multiplier

| Tier | Multiplier |
|---|---:|
| Common | 1.00x |
| Uncommon | 1.05x |
| Rare | 1.15x |
| Epic | 1.25x |
| Legendary | 1.40x |

- Read only from the `Tier` attribute, never from the name or the image.
- A missing or unrecognised Tier gets 1.00x and is flagged.
- Tier does not affect laser charges or anything else.

## Unmapped traits

- Any trait or value without a rule has no gameplay effect.
- Head perks (crown, cap, magnet) are not implemented. They need the real Head values first, and a magnet needs a pickup system.
- Background, Skin, Body, Form and the rest are display only.
