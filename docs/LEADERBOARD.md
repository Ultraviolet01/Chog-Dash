# Leaderboard

## Ranking

- One entry per player: each username's best total distance, flying any Chog they own.
- Screen (Ranks), laid out like a game leaderboard:
  - Podium for the top 3 (gold, silver, bronze), each with the Chog they set the record with.
  - Rows from 4th place down: rank, Chog portrait, username, Chog name and tier, total distance in large numbers.
  - The player's own standing is pinned to the bottom ("YOU #13 ..."), or a prompt to sign in or fly if they aren't ranked yet. Their row is highlighted on the board.
  - Empty board: "No pilots yet" with a button to fly a Chog.
  - When signed in, `GET /api/leaderboard` with the sign-in token also returns `me` (the player's own rank and best run).
- Pilot names:
  - Set after signing in (`POST /api/profile`, signed in). One name per wallet.
  - 3 to 16 letters, numbers or underscores, starting with a letter, so a name can't look like a wallet address.
  - Unique regardless of letter case. Changing your name frees the old one.
  - The leaderboard looks names up when it's shown, so a rename applies to past entries too.
  - A pilot name is required before a ranked run (the server refuses to start one without it).
- Ranked by total distance: distance flown x the Chog's tier multiplier (Common 1.00, Uncommon 1.05, Rare 1.15, Epic 1.25, Legendary 1.40), rounded down. Computed on the server.
- The table shows rank, username and total distance. The distance actually flown and the Chog used are stored and returned by the API.
- Practice runs are never submitted.

## Flow

1. Sign-in: the server issues a one-time message. The wallet signs it (free, no transaction). The server checks the signature and returns a 12-hour sign-in token and the wallet's pilot name, if set.
   - After sign-in the browser finds the wallet's Chogs by scanning `ownerOf` for every token through Multicall3. This only decides what to show; the server never trusts it.
2. Run start (each time the ready screen shows): the server checks on-chain that the wallet owns the token, reads the token's metadata itself, and records the tier, multiplier and laser charges in a run session.
3. Run finish: the client sends distance, run time and laser shots. The server:
   - accepts each run only once, from the same wallet;
   - rejects a run time longer than the session has existed;
   - rejects a distance faster than the game allows (speed depends only on distance, so the maximum distance for a run time is known);
   - rejects more laser shots than the Chog's charges;
   - re-checks ownership on-chain;
   - computes the total distance with its own multiplier, ignoring anything the client claims.
4. Every submission is stored with wallet, token ID, raw distance, total distance, tier, multiplier and validation status (validated or rejected, with the reason).

## Quests (Chog holders only)

- Each day: 3 daily quests (one easy, one medium, one hard). Each week: 1 weekly quest.
  - The same quests for every player, chosen from the date (`js/quests.js`), automatically, with nothing to schedule. Pools of 10 easy, 11 medium and 9 hard dailies and 6 weeklies: a quest never repeats on back-to-back days, each returns every 9 to 11 days, and the same three dailies only come back after 990 days.
  - Dailies reset at 00:00 UTC. The weekly quest resets on Monday at 00:00 UTC.
- Rewards are badges only. One badge per quest, plus one Streak badge (37 in total).
  - Badges level up like trophies: Bronze, Silver, Gold, Platinum.
    - Quest badges: at 1, 5, 15 and 40 completions.
    - Streak badge: at 3, 7, 14 and 30 days in a row. Missing a full day restarts the streak; the badge keeps its tier.
- Streak:
  - A day counts when all 3 dailies are done AND validated Chog runs that day add up to at least 5 minutes.
  - Streak lives: every 7th day in a row banks lives (7 days +1, 14 days +3, 21 days +5, 28 days +7 ...). A broken streak counts again from day 1, so the rewards can be earned again.
  - Banked lives are a stock (`lives:<wallet>`). Each Chog run gets them at run start (`bankLives`), on top of the 3-life cap. They are spent only after the run's Stardust lives are gone; what's left stays banked.
  - `/run/finish` reports `bankLivesUsed`; the server takes that many out of the bank (never more than the run was given), even if the score is rejected.
  - The frame's shape and metal show the tier (circle, shield, hexagon, star); the glyph's colour shows the quest's difficulty.
  - Rarity: "Earned by 8% of pilots", the share of quest players who own the badge, with a label (Ultra rare under 5%, Very rare, Rare, Uncommon, Common). The counters are approximate if two runs finish at the same instant.
  - Pin: a player can pin one earned badge (`POST /api/badge/pin`). It shows next to their name on the leaderboard and on their run card.
- In the game:
  - Today's 3 quests show on the ready and crash screens of Chog NFT runs.
  - "Quest complete" pops up during the run as soon as the live run reaches a target. This is a prediction for the celebration; the server's result after the run is what counts.
  - New badges and new tiers are revealed one by one after the run.
  - The Quests panel shows the last 7 days as a flame strip (lit when all 3 dailies were done).
- Holders only:
  - `GET /api/quests` (signed in) checks `balanceOf` on the Chog Genesis contract, cached for 10 minutes. A wallet with no Chog gets 403.
  - Progress only comes from validated Chog NFT runs, which already require owning the Chog at start and at finish.
- Run stats sent with `POST /api/run/finish`: Stardust, power-ups, Golden Horns, near misses and lives used.
  - The server caps each one at what the run's length allows (for example one power-up per 12 seconds after the first 10).
  - Distance and run time are the validated values.
  - If saving quest progress fails, the run still counts on the leaderboard.
- Leaderboard rows show each player's badge count.
- Storage, all in `chog_kv` (no schema change): `quest:`, `badges:`, `streak:`, `qlog:` (last 14 days), `pin:`, `lives:` and `holder:` per wallet, and the rarity counters `bstat:players` and `bstat:<badge>`.

## Limits (honest)

- These checks stop casual cheating. They can't prove a run was really played: someone who scripts plausible distances can still submit them.
- Stronger options for later: record inputs and the obstacle seed and replay the run on the server, or add rate limits and review of outlier scores.

## Storage

- Production: Supabase (Postgres).
  - Run `supabase/schema.sql` once in the Supabase SQL editor. It creates three tables and the functions the server uses:
    - `chog_leaderboard`: one row per player (wallet) with their best total distance and the run that set it.
    - `chog_runs`: every submitted run, validated or rejected, with the reason.
    - `chog_kv`: short-lived records (sign-in nonces, run sessions, cached metadata) and usernames.
  - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server (see `.env.example`).
  - Browsers never reach the database: row level security is on with no policies, and only the service role can run the functions.
  - Tested by `test/supabase.test.js`, which runs the schema on a real Postgres engine (PGlite) through the same calls the server makes.
- In production the server refuses to start without the Supabase settings, so data is never silently lost.
- Local development without them uses in-memory storage, which is lost on restart.
