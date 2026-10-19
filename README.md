# Chog Dash

A 3D space dodge game in the spirit of Dookey Dash, built for the [Chog Genesis](https://opensea.io/collection/chog-genesis) NFT collection on Monad. You ride a rocket through open space and dodge asteroids and debris for as long as you can.

Play it at https://chog-dash.vercel.app (desktop and phone browsers, nothing to install).

## Home screen

- Live 3D scene with the rider on its rocket as the hero, a big PLAY button and a Practice / Chog NFT / Demo switch.
- The line under the switch explains the mode. In Chog NFT mode it also shows your tickets and this week's prize pool.
- Top: your best distance (or the selected Chog's best total distance) and a wallet chip.
- Bottom: Ranks (leaderboard), Tickets (Chog NFT mode, once the pool contract is live), Quests and How to play. Space or Enter also plays.

## Three modes

| | Practice | Chog NFT | Demo |
|---|---|---|---|
| Who | Anyone | Chog Genesis holders | Anyone |
| Wallet | Not needed | Monad wallet with a Chog | Optional (any wallet, for the DEMO board) |
| Rider | Rookie, the practice pilot | Your own Chog | One of 5 real Chogs |
| Traits, abilities, tier scoring | No | Yes | Yes |
| Quests, badges, streak | No | Yes (saved on the server) | Yes (saved on the device) |
| Chog career (levels, titles) | No | Yes (saved per Chog, public) | Yes (saved on the device) |
| Trait of the week bonus | No | Yes | Yes |
| Leaderboard | None | Weekly Chog NFT board | DEMO board |
| Cost | Free | $0.50 in $CHOG per ranked run | Free |
| Prizes | No | Weekly $CHOG prize pool (top 10) | No |

### Why we made Demo mode

- **Most people don't own a Chog yet.** Chog NFT mode is the heart of the game, but without a Chog you could only see Practice, which leaves out everything that makes a Chog special: traits, Laser Eyes, rocket looks, tier scoring, quests and the streak.
- **Try before you buy.** Demo lets anyone fly 5 real Chog Genesis NFTs, one from each tier, with every Chog NFT feature. Players see what holding a Chog gets them before they buy a Chog or $CHOG.
- **Judges and reviewers.** Hackathon judges, partners and press can test the whole experience in seconds, with no NFT, no tokens and no setup.
- **Testing without real money.** Chog NFT mode uses real $CHOG on Monad mainnet, with no testnet version. Demo is where new features get tried safely, and where we test the game without spending tickets.
- **Still competitive.** Signing in with any wallet puts demo runs on their own DEMO leaderboard, checked by the server like real runs, so visitors have something to chase from their first run.
- **Kept apart.** Demo runs never touch the Chog NFT leaderboard, the prize pool or a holder's real streak, so the ranked game stays fair.

### Mode details

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
  - Validated runs go on the weekly Chog NFT leaderboard (resets every Monday 00:00 UTC).
  - Tickets and the weekly prize pool (details in docs/POOL.md):
    - One ticket = one ranked run, $0.50 worth of $CHOG, paid from your wallet into a public pool contract on Monad. A ticket is used when the rocket takes off.
    - No ticket: you can still fly; the run just isn't ranked.
    - Every week the top 10 share that week's pool (25/18/13/10/8/7/6/5/4/4%); unearned shares roll over. No fee.
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

## Chog careers

- Every Chog token builds its own career from the runs flown with it. It belongs to the token, not the wallet: when the NFT is sold or traded, its level, titles and run history go with it.
- **XP and levels:** each valid run earns XP: 1 per 20 m flown, +50 for every zone reached past the first, +10 per run. Level L needs 50 x L x (L - 1) XP (100, 300, 600, 1,000 ...), up to level 50.
- **Titles (14):** First Flight; zone titles (Asteroid Belt Veteran, Galactic Drifter, Deep Cosmic Diver, Milky Way Voyager, Second Lap); Frequent Flyer and Space Veteran (25 and 100 runs); 100 km Flown and Million Meter Chog; Passed Down (flown by more than one pilot); Weekly Top 10, Weekly Podium and Weekly Champion.
- **Weekly honors:** finishing a week in the top 10 is recorded on the Chog's career when the week is over.
- **What counts:** every server-validated Chog NFT run, ranked or unranked. Rejected runs don't count.
- **Where it shows:** the level and headline title on the Chog picker, the ready screen, the game over card (XP gained, level up, new titles), the run card and the leaderboard. Tapping a Chog NFT leaderboard entry or the Career button opens its full career: level, XP, stats, titles, weekly honors and the last 10 runs.
- **Public:** anyone can open any Chog's career, also as a link (`?chog=<token id>`). `GET /api/career?token=<id>`.
- **Demo Chogs** have careers too, with the same rules, kept on the device ("Reset demo progress" clears them).
- Rules: js/career.js (shared by the browser and the server). Storage: one `career:<token id>` record in the existing key-value table, so no database change is needed.

## Trait of the week

- Every week (Monday 00:00 UTC, the same weeks as the leaderboard) one trait group is featured. Chogs with it get **+10% total distance** that week, on top of their tier multiplier (for example Rare x1.15 x 1.10 = x1.265).
- 12 groups rotate in a fixed order, so players can plan ahead. They cover different parts of the collection, so different Chogs get their moment:

| # | Trait group | Chogs |
|---|---|---:|
| 1 | Fire Auras (Burning Aura, Fiery Aura, Fire) | 202 |
| 2 | Laser Eyes | 277 |
| 3 | Pink Skin | 557 |
| 4 | Skull & Radioactive | 90 |
| 5 | Purple Skies (purple, lavender and magenta backgrounds) | 369 |
| 6 | Red Skin | 299 |
| 7 | Water, Wind & Smoke (Aqua Aura, Wind, Smoke) | 184 |
| 8 | Accessories (any) | 195 |
| 9 | Black Skin | 263 |
| 10 | Blue Skies (aqua and blue backgrounds) | 382 |
| 11 | Yellow Skin | 246 |
| 12 | Left-Facing Chogs | 650 |

- The week of 19 October 2026 is Fire Auras; the order then continues as listed and repeats.
- The bonus uses the week the rocket takes off in, and the server applies it from the Chog's own metadata. The leaderboard shows which runs had it.
- Where it shows: the ready screen, the Chog picker (a "+10% this week" tag), demo cards, the career page, Ranks and How to play (with the next weeks).
- Rules: `weeklyTrait` in js/config.js, worked out in js/traits.js.

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

- A hit uses a life if you have one (Stardust lives first, then streak lives in Chog NFT runs); with no lives left, it ends the run. Touching the screen edges does not.
- Speed rises with distance for the whole run: gently to x2.25 over the first two minutes (x1.6 after one minute), then it keeps climbing, more slowly the further you go (about x2.3 in Zone 2, x3.4 in Zone 5, x3.9 on loop 2).
- To keep it fair at high speed, obstacles appear further ahead (about 2.4 s of warning), steering gets faster, and obstacle groups never come closer together in time than at x2.25.
- Obstacles get denser with distance (groups of 1, then 2, then 3), and closer together until about 6,300 m (about 3 minutes in).
- Every obstacle group leaves a reachable safe path.
- Near misses flash on screen. They are feedback only and do not change the distance.
- **Laser Eyes** (Chogs whose Eyes trait maps to it):
  - Exactly 10 charges per run, no recharge, reset only when a new run starts.
  - One charge per shot. A shot destroys every eligible obstacle in the beam path.
  - Huge asteroids are not eligible: they block the beam, protecting anything behind them.
  - Tier never changes the number of charges.
- **Total distance (NFT mode)**: distance flown (m) x tier multiplier (x 1.10 when the Chog has the trait of the week), rounded down. The leaderboard ranks total distance. The distance actually flown is always shown too.

## Running it

- Practice only: open `index.html` in a browser (needs internet for three.js).
- Full game, wallet and leaderboard:
  - `npm install`
  - `npm run dev`, then open http://localhost:3000
  - Wallets can't connect to a page opened as a file, so NFT mode needs a server.
- Deploy: the repo is ready for Vercel (static files plus one `api/` function for every route).
  1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor (run it again after updates).
  2. Set the variables in `.env.example` on Vercel: `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POOL_ADMIN` (the pool owner's wallet address), and optionally `MONAD_RPC_URL`.
  3. Prize pool: open `/admin.html`, connect the `POOL_ADMIN` wallet and deploy the pool contract (see docs/POOL.md).

## Checks and tests

- `npm run test:browser`: headless browser tests of mouse control, the zone loop, the laser rules and the full NFT flow, against a mock wallet, contract and IPFS.
- `npm test`: unit and API tests (trait mapping, tier scoring, contract decoding, gateway fallback, sign-in, run validation, leaderboard, tickets and the weekly pool, the browser's transaction encoding).
- `npm run test:contract`: the pool contract's Foundry tests (needs Foundry).
- `npm run test:fork`: tickets end to end on a local fork of Monad mainnet with real $CHOG (needs `anvil --fork-url https://rpc.monad.xyz --port 8546`).
- `npm run verify-contract`: reads the live contract (chain ID, interfaces, supply, token ID range, tokenURI). Writes `data/contract-report.json`.
- `npm run audit-metadata`: loads every token's metadata, lists every trait type and value, and reports what the gameplay mapping does with each. Writes `data/collection-audit.json` and `docs/TRAIT-AUDIT.md`.

## Project layout

- `index.html`, `css/`, `js/`: the game (no build step).
  - `js/config.js`: collection details, ability mapping, tier multipliers, shared tuning.
  - `js/traits.js`: trait normalisation, ability mapping, scoring (shared with the server).
  - `js/chain.js`, `js/metadata.js`: wallet, contract reads, IPFS gateway fallback.
  - `js/art.js`, `js/scenery.js`, `js/game.js`, `js/ui.js`: rider art, space scenery, game, menus.
- `admin.html`, `js/admin.js`: the pool owner's page (deploy, results, pay winners).
  - `js/tickets.js`: ticket and pool transactions from the player's or owner's wallet.
- `contracts/`: the pool contract and its tests (Foundry); `js/pool-artifact.js` is its build (`npm run build:pool`).
- `api/`, `lib/`: leaderboard server (one Vercel function, `api/router.js`, that vercel.json routes every API path to); `lib/pool.js`: tickets and the weekly pool.
- `server/dev.js`: local server for the game plus API.
- `scripts/`: contract and metadata audits.
- `docs/`: verification status, trait mapping, art, leaderboard design.

## Roadmap

- **Now (live on Monad mainnet)**
  - Practice, Chog NFT and Demo modes, with 8 pickups, 5 zones and Laser Eyes.
  - Tickets ($0.50 in $CHOG) and the weekly $CHOG prize pool, shared by the top 10 every Monday. Public pool contract, no fee.
  - Weekly Chog NFT and DEMO leaderboards.
  - Chog careers: levels, titles and run history that belong to each Chog token and follow it to new owners.
  - Trait of the week: a rotating +10% bonus for a different group of Chogs every week.
  - Daily and weekly quests, tiered badges with rarity, streaks and streak lives.
  - Shareable run cards (X 16:9 or square) with one-tap share to X.
- **Next**
  - Own domain and standard "Sign-In with Ethereum" messages, so wallets show fewer warnings.
  - Weekly winner announcements and payout recaps for the community.
  - Seasonal events and new zones.
- **Later**
  - A small pool fee once the player base grows, to fund development and bigger prize events (it needs a new contract; today's contract has no fee).
  - Guest riders from other Monad NFT collections.
  - Tournaments with sponsored prize pools.

## Status

- See [docs/VERIFICATION.md](docs/VERIFICATION.md) for what has and hasn't been verified against the live collection.
