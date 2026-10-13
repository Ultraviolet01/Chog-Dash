# Chog Dash

A 3D space dodge game in the spirit of Dookey Dash, built for the [Chog Genesis](https://opensea.io/collection/chog-genesis) NFT collection on Monad. You ride a rocket through open space and dodge asteroids and debris for as long as you can.

## Two ways to play

- **Practice mode (anyone)**
  - Play as Rookie, the practice pilot, on a rocket. No wallet needed.
  - Same movement, obstacles, collisions and restarts as NFT mode.
  - Best distance is saved on your device only. Practice runs never go on the NFT leaderboard.
- **Chog NFT mode (holders)**
  - Connect a wallet on Monad, pick a Chog you own, and ride the rocket as that Chog.
  - Ownership is checked on-chain. The Chog's own artwork is used as the rider.
  - Abilities and the tier score multiplier come from the token's real metadata.
  - Validated runs go on the official NFT leaderboard.

## Controls

- Mouse: move the mouse and the rocket follows it, up, down, left and right. Clicking only starts a run.
- Keyboard: hold Space, W or Up to rise, release to fall. Steer with A/D or Left/Right.
- Whichever you used last (mouse or keyboard) is in control.
- Laser Eyes: E (only for Chogs with that trait).
- Touch screens: drag to fly the rocket in any direction, on-screen LASER button.
- There is no boost. Speed rises on its own as you travel further.

## Performance

- The game lowers its render resolution on its own if the frame rate stays under 45 fps.
- Add `?fps` to the address (for example `index.html?fps`) to show the frame rate and quality level in the corner.

## Zones

The run is split into four zones of 500 m each, repeating in a loop (one loop is 2,000 m). Speed keeps rising across loops.

| Zone | Scenery | Obstacles |
|---|---|---|
| 1. Outer Space | Blue and violet nebula, black hole | Balanced mix of asteroids and debris |
| 2. Asteroid Belt | Rock fields streaming past on both sides, dusty light | Nearly all asteroids, more huge ones |
| 3. Galactic Drift | Cyan and teal nebula | Mostly debris, drifting hard sideways |
| 4. Deep Cosmic Zone | Dark violet, larger black hole | Shorter view distance, so obstacles appear later |

- A banner names each zone as you enter it, and the HUD shows the current zone and loop.
- Scenery blends smoothly between zones. Every zone keeps a reachable safe path.
- Zone lengths and order are in `js/config.js` (`game.zones`); obstacle mixes are in `js/game.js` (`ZONE_RULES`); looks are in `js/scenery.js` (`LOOKS`).

## Gameplay rules

- One hit ends the run. Touching the screen edges does not.
- Speed rises with distance, and obstacles get denser (groups of 1, then 2, then 3).
- Every obstacle group leaves a reachable safe path.
- Near misses flash on screen. They are feedback only and do not change the score.
- **Laser Eyes** (Chogs whose Eyes trait maps to it):
  - Exactly 10 charges per run, no recharge, reset only when a new run starts.
  - One charge per shot. A shot destroys every eligible obstacle in the beam path.
  - Huge asteroids are not eligible: they block the beam, protecting anything behind them.
  - Tier never changes the number of charges.
- **Score (NFT mode)**: score = distance (m) x tier multiplier, rounded down. Raw distance is always shown separately.

## Running it

- Practice only: open `index.html` in a browser (needs internet for three.js).
- Full game, wallet and leaderboard:
  - `npm install`
  - `npm run dev`, then open http://localhost:3000
  - Wallets can't connect to a page opened as a file, so NFT mode needs a server.
- Deploy: the repo is ready for Vercel (static files plus the `api/` functions). Set the variables in `.env.example`.

## Checks and tests

- `npm run test:browser`: headless browser tests of mouse control, the zone loop, the laser rules and the full NFT flow, against a mock wallet, contract and IPFS.
- `npm test`: unit and API tests (trait mapping, tier scoring, contract decoding, gateway fallback, sign-in, run validation, leaderboard).
- `npm run verify-contract`: reads the live contract (chain ID, interfaces, supply, token ID range, tokenURI). Writes `data/contract-report.json`.
- `npm run audit-metadata`: loads every token's metadata, lists every trait type and value, and reports what the gameplay mapping does with each. Writes `data/collection-audit.json` and `docs/TRAIT-AUDIT.md`.

## Project layout

- `index.html`, `css/`, `js/`: the game (no build step).
  - `js/config.js`: collection details, ability mapping, tier multipliers, shared tuning.
  - `js/traits.js`: trait normalisation, ability mapping, scoring (shared with the server).
  - `js/chain.js`, `js/metadata.js`: wallet, contract reads, IPFS gateway fallback.
  - `js/art.js`, `js/scenery.js`, `js/game.js`, `js/ui.js`: rider art, space scenery, game, menus.
- `api/`, `lib/`: leaderboard server (Vercel functions).
- `server/dev.js`: local server for the game plus API.
- `scripts/`: contract and metadata audits.
- `docs/`: verification status, trait mapping, art, leaderboard design.

## Status

- See [docs/VERIFICATION.md](docs/VERIFICATION.md) for what has and hasn't been verified against the live collection.
