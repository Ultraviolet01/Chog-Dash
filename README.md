# Chog Dash

A 3D space dodge game in the spirit of Dookey Dash, built for the [Chog Genesis](https://opensea.io/collection/chog-genesis) NFT collection on Monad. You ride a rocket through open space and dodge asteroids and debris for as long as you can.

## Home screen

- Live 3D scene with the rider on its rocket as the hero, a big PLAY button and a Practice / Chog NFT switch.
- Top: your best distance (or the selected Chog's best total distance) and a wallet chip.
- Bottom: Ranks (leaderboard) and How to play. Space or Enter also plays.

## Two ways to play

- **Practice mode (anyone)**
  - Play as Rookie, the practice pilot, on a rocket. No wallet needed.
  - Same movement, obstacles, collisions and restarts as NFT mode.
  - Best distance is saved on your device only. Practice runs never go on the NFT leaderboard.
- **Chog NFT mode (holders)**
  - Connect a wallet on Monad and sign the sign-in message (free, no transaction).
  - The game then finds every Chog Genesis NFT the wallet holds and shows them. Pick one and ride the rocket as that Chog.
    - The contract can't list a wallet's tokens, so the game checks the owner of all 1,969 tokens in a few batched reads (Multicall3). This takes about a second.
  - Choose a username (pilot name). The leaderboard shows usernames and distances, one entry per player (their best run with any of their Chogs).
  - Ownership is checked on-chain again when a run starts and when it's submitted. The Chog's own artwork is used as the rider.
  - Abilities and the tier distance multiplier come from the token's real metadata.
  - The rocket's look comes from its traits too (looks only): painted in its Background colour, an Aura trail, special Skull and Radioactive rockets, and a unique rocket for each one-of-one Legendary. See docs/TRAIT-MAPPING.md.
  - Validated runs go on the official NFT leaderboard.
- **Demo mode (anyone, for judging and visitors)**
  - The DEMO tab on the home screen. No Chog needed. Pick one of 5 real Chog Genesis NFTs and fly it with every Chog NFT feature.
  - One Chog from each tier, so every kind of rocket shows up, two with Laser Eyes:
    - CHOG #1529 (Common x1.00): fire laser, Fiery Aura flame trail.
    - CHOG #1709 (Uncommon x1.05): no laser, Wind trail.
    - CHOG #1324 (Rare x1.15): purple laser, Skull rocket, Electric Shock trail.
    - CHOG #598 (Epic x1.25): no laser, Radioactive glowing rocket, Aqua Aura water trail.
    - CHOG #1290 Krown (Legendary x1.40): no laser, one-of-one rocket with a crown and a glow trail.
  - Tier scoring, rocket looks, quests, badges, the streak and streak lives work exactly as in Chog NFT mode (same rules), kept on the device.
  - It starts from zero like a new wallet (no streak, streak lives or badges), kept on that device only.
  - The DEMO leaderboard (a separate, real board): connect any wallet (it doesn't need a Chog), sign in and pick a pilot name. Demo runs are then checked by the server like Chog NFT runs (run time, distance, Laser Eyes) and ranked on the DEMO tab of Ranks. Without signing in, demo runs aren't ranked. Demo runs never touch the Chog NFT leaderboard or a holder's real streak lives.
  - The run card carries a DEMO stamp (and the DEMO rank). "Reset demo progress" in the demo picker starts the local quests and streak over.
  - Storage: the `chog_demo_leaderboard` table in supabase/schema.sql (run it again to add it).
  - Metadata for the 5 Chogs is embedded in js/demo.js (no chain calls); their artwork loads from IPFS.

## Controls

- Mouse: move the mouse and the rocket follows it, up, down, left and right. Clicking only starts a run.
- Keyboard: W/A/S/D or the arrow keys move the rocket up, down, left and right. It stays where it is when you let go.
- Click or Space starts a run.
- After a crash: PLAY AGAIN (or Space, R, a click or a tap) restarts straight away. Share run, Ranks and Home sit beside it; Esc also goes Home. Chog NFT runs register with the leaderboard server first, so the new run is still ranked.
- Full screen: press F or use the full-screen button (home screen and in-game). Esc or F again to leave. The mouse cursor hides while you fly.
- Whichever you used last (mouse or keyboard) is in control.
- Laser Eyes: E (only for Chogs with that trait).
- Touch screens: drag to fly the rocket in any direction; tap the round LASER button (bottom right, under the right thumb) to fire Laser Eyes. It fires on touch-down and never starts a drag or a zoom (no two-finger gesture, which phones read as pinch-zoom).
- There is no boost. Speed rises on its own as you travel further.

## Sound

- Background music: the track "Beyond the Outer Rim" (`audio/beyond-the-outer-rim.mp3`, 2:52, MP3 128 kbps, about 2.7 MB).
  - Streamed through two audio players, so it never sits fully decoded in memory; near the end, the other player starts from the top and the two crossfade, so it loops without a gap.
  - It only downloads while Music is on, and pauses when Music is switched off.
  - If it can't load (offline, or `index.html` opened straight from disk), a synthesised space tune plays instead.
  - The local dev server serves `/audio/` with byte ranges, like Vercel, so the browser can seek in the track.
- Sound effects are synthesised in the browser (`js/audio.js`, Web Audio API): no effect files. In a run, an engine hum rises with speed (it roars while Dash is active).
- Each pickup has its own tone: Stardust chimes climb in pitch along a streak; Golden Horn fanfare; Dash boost whoosh; Magnet wobble; Slow-Mo downward sweep; Nova screen-clear blast with a shockwave and crackling rocks; Radar sonar ping; Mystery Box roll, then the revealed power's tone.
- Also: launch, crash, near miss, warp gate, extra life, life used, smash crunch, button clicks.
- Laser Eyes: a zap with a short buzzing beam, then a blast when it destroys something. The beam pierces everything in its path, huge asteroids included.
- Sound button (top right) opens a panel with separate switches for Music and Sound effects (the engine hum counts as an effect).
- M turns all sound off or back on. Choices are remembered on the device.
- Browsers start sound after the first click, tap or key.

## Run card

- After every run, practice or Chog NFT, SHARE RUN makes a share card, laid out like other games' share cards:
  - the rider's art front and centre (the Chog's own portrait in a tier-coloured ring, or Rookie)
  - one huge number: total distance (distance in practice), with how it was made
  - NEW BEST badge on a record run, and the leaderboard rank once the server validates the run
  - stats row: time, Stardust, near misses
  - the zone path: how far through the five zones the run got (and the loop)
  - "Beat my run" with the game's address
- Two formats: Wide 1200x675 (shows uncropped in an X post) and Square 1080x1080.
- Buttons:
  - **Share to X**: on phones it opens the share menu with the image attached (pick X). On desktop X's post page opens with the text filled in and the card is copied, ready to paste with Ctrl+V / Cmd+V (X's post link can't carry an image itself). If copying isn't allowed, the card is downloaded instead.
  - **Share...**: the system share menu, where the browser has one.
  - **Download**: saves the PNG.

## Performance

- The game lowers its render resolution on its own if the frame rate stays under 45 fps.
- Add `?fps` to the address (for example `index.html?fps`) to show the frame rate and quality level in the corner.

## Pickups

Nothing spawns in the first 10 seconds of a run. Pickups can appear anywhere, risky spots included.

| Pickup | What it does |
|---|---|
| Stardust | Every 100 gives an extra life (hold up to 3). A crash with a life continues the run with 2 s of protection. Resets each run. |
| Golden Horn | Rare, worth 50 Stardust. |
| Dash | Speed burst (x1.8) that smashes through anything in its path, huge asteroids included, for 3 s. |
| Magnet | Pulls in Stardust and Golden Horns nearby for 10 s. |
| Slow-Mo | Slows the whole game (x0.6) for 6 s. |
| Nova | Clears every small obstacle on screen; huge asteroids stay. |
| Radar | Outlines incoming obstacles through the dark for 12 s. Only appears in the Deep Cosmic Zone. |
| Mystery Box | Turns into a random power-up. |

- Power-ups float inside wobbling water bubbles that pop when collected. Stardust spins and twinkles; Golden Horns sway and pulse.

- A power-up appears every 20 to 30 seconds. The same power-up is never on screen twice at once.
- Grabbing a power-up that is already running adds its time (for example, a second Dash adds 3 s).
- Active power-ups show as icons with countdown rings; the Stardust meter and lives are at the bottom.
- Tuning is in `js/config.js` (`game.pickups`). The leaderboard server allows for Dash when checking distances.

## Zones

The run passes through five zones that repeat in order. Each zone lasts longer than the one before: 2, 4, 8, 14, 22, 32, 44 ... minutes (each step adds 2 minutes more than the last). Speed keeps rising the whole time.

| Zone | Length (first loop) | Runs from | Scenery | Obstacles |
|---|---|---|---|---|
| 1. Outer Space | 2 min | 0:00 to 2:00 | Blue and violet nebula, black hole | Balanced mix of asteroids and debris |
| 2. Asteroid Belt | 4 min | 2:00 to 6:00 | Rock fields streaming past on both sides, dusty light | Nearly all asteroids, more huge ones |
| 3. Galactic Drift | 8 min | 6:00 to 14:00 | Cyan and teal nebula | Mostly debris, drifting hard sideways |
| 4. Deep Cosmic Zone | 14 min | 14:00 to 28:00 | Dark violet, larger black hole | Shorter view distance, so obstacles appear later |
| 5. Milky Way | 22 min | 28:00 to 50:00 | The whole Milky Way spiral glowing ahead, warm starlight | Everything drifts, more huge rocks |
| Loop 2 starts | 32 min, 44 min ... | from 50:00 | | |

- Times assume the game runs at full speed; zone boundaries are fixed distances worked out from these times, so a slow machine reaches them a little later.
- Each zone change is a moment: a warp gate in the next zone's colour appears about 125 m ahead, nothing spawns around it, and flying through it fires a warp burst, a flash in the zone's colour, a quick scenery switch and an ENTERING banner.
- The HUD shows the current zone and loop.
- Every zone keeps a reachable safe path.
- Zone order and timing are in `js/config.js`; obstacle mixes in `js/game.js` (`ZONE_RULES`); looks in `js/scenery.js` (`LOOKS`).

## Gameplay rules

- One hit ends the run. Touching the screen edges does not.
- Speed rises with distance for the whole run: quickly to x2.8 in the first 35 seconds, then it keeps climbing, more slowly the further you go (about x3.5 in Zone 2, x7 in Zone 5, x9 on loop 2).
- To keep it fair at high speed, obstacles appear further ahead (about 2.4 s of warning), steering gets faster, and obstacle groups never come closer together in time than at x2.8.
- Obstacles get denser with distance (groups of 1, then 2, then 3).
- Every obstacle group leaves a reachable safe path.
- Near misses flash on screen. They are feedback only and do not change the distance.
- **Laser Eyes** (Chogs whose Eyes trait maps to it):
  - Exactly 10 charges per run, no recharge, reset only when a new run starts.
  - One charge per shot. A shot destroys every eligible obstacle in the beam path.
  - Huge asteroids are not eligible: they block the beam, protecting anything behind them.
  - Tier never changes the number of charges.
- **Total distance (NFT mode)**: distance flown (m) x tier multiplier, rounded down. The leaderboard ranks total distance. The distance actually flown is always shown too.

## Running it

- Practice only: open `index.html` in a browser (needs internet for three.js).
- Full game, wallet and leaderboard:
  - `npm install`
  - `npm run dev`, then open http://localhost:3000
  - Wallets can't connect to a page opened as a file, so NFT mode needs a server.
- Deploy: the repo is ready for Vercel (static files plus the `api/` functions).
  1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
  2. Set the variables in `.env.example` on Vercel: `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and optionally `MONAD_RPC_URL`).

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
