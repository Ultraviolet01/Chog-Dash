# Verification status

Last checked live on 2026-10-13. Only items listed under "Verified" were actually checked.

## Verified against the live collection

Checked with `npm run verify-contract` (`data/contract-report.json`), `npm run audit-metadata` (`docs/TRAIT-AUDIT.md`, `data/collection-audit.json`) and the OpenSea collection page.

- **Contract:** `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` has code on Monad.
  - Name "Chog Genesis", symbol CHOG.
  - OpenSea's chog-genesis page lists the same contract, on Monad.
- **Chain:** ID 143, from `https://rpc.monad.xyz`.
- **Supply:** totalSupply is 1,969.
- **Interfaces:** ERC-721 and ERC-721 Metadata are supported.
  - ERC-721 Enumerable is **not** supported, so a wallet's tokens cannot be listed from the contract.
  - Instead, after sign-in the game scans `ownerOf` for every token through Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`, deployed on Monad) and lists the wallet's Chogs.
  - Tested against the real chain: a wallet with 7 Chogs had all 7 found (matching `balanceOf`) in about 2 seconds, with real artwork, in the browser.
- **Token IDs:** run from 1 to 1969. Token 0 and token 1970 revert.
- **Token ID and name number are different.** Metadata files are shuffled against token IDs.
  - Token 1 has `tokenURI` `.../1462.json`, named "CHOG #1462".
  - Token 1602 points at `.../1094.json`.
  - The game always reads the token's own `tokenURI` and never derives anything from the name.
- **Metadata:** every tokenURI is `ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/<n>.json`. All 1,969 files were loaded.
- **Images:** every image is `ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/<n>.webp`. The audit found 0 image issues and 0 metadata problems.
- **Image style:** close-up portraits with baked-in backgrounds, not transparent. The game shows them as a round portrait in a bubble helmet (see docs/ART.md).
- **Trait types:** Background, Base, Skin, Side, Body, Mouth, Eyes, Head, Accessory, Form, Tier, Naked and Aura.
  - Some traits are optional: for example, Accessory appears on 195 tokens and Aura on 974.
  - The 10 one-of-one Legendaries have only Base ("1:1") and Tier.
- **Tier:** five values: Common 1,279, Uncommon 590, Rare 60, Epic 30, Legendary 10. All have a multiplier.
- **Laser Eyes:** 58 Eyes values in total. Four contain a laser: Purple laser, fire laser, Green laser and cyan laser.
  - Together they cover 277 tokens.
  - The rule in `js/config.js` is now an explicit list of these four values.
- **IPFS gateways:** these were tested on the day of the check.
  - `ipfs.filebase.io` is fast and allows browser requests (CORS), so it is first in the list.
  - `ipfs.io`, `gateway.pinata.cloud` and `dweb.link` often returned 429 (rate limited).

## Still not verified

- **Real ownership:** signing in and submitting a ranked run with a real wallet that owns a Chog (the scan itself was tested on the real chain, read-only).

## How to re-check

1. `npm run verify-contract` and review `data/contract-report.json`.
2. `npm run audit-metadata` and confirm `docs/TRAIT-AUDIT.md` says "complete".
   - Cached files in `data/metadata-cache/` are reused, so a rerun only fetches what failed before.
3. Test in a real wallet with the representative tokens listed at the end of the audit.

## Tested in the build environment

- **Unit and API tests** (`npm test`, plus `npm run test:browser`):
  - trait mapping and tier scoring
  - contract call encoding and decoding
  - gateway fallback
  - sign-in, run validation and leaderboard ranking
- **Headless browser runs** (Chromium, software WebGL):
  - practice mode, zones, pickups, Laser Eyes and fullscreen
  - phones (emulated iPhone 13 portrait and landscape, touch input): layout fits, 44 px tap targets, home rocket in the free space, touch drag steering, crash, run card, tap to restart
  - the full NFT flow against a mock wallet, mock contract and mock IPFS
- **Real data:** token 1's real metadata and image were loaded through the real gateways and rendered as the rocket rider.
