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
