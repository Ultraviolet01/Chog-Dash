# Tickets and the weekly prize pool

Chog NFT mode only. Practice, demo and the DEMO leaderboard stay free.

## The rules

- **Ticket:** one ranked Chog NFT run. Price: $0.50 worth of $CHOG (`0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`, Monad).
  - The server quotes the $CHOG amount from the live price (the most liquid Monad market on DexScreener, today nad.fun), rounded up to a whole $CHOG. A quote can be paid within 10 minutes.
  - 1 to 20 tickets per purchase. Unused tickets never expire.
- **When a ticket is used:** the moment the rocket takes off (`POST /api/run/fly`), not when the result is sent, so a bad run can't be dropped for free.
  - No ticket: the run still flies and counts for quests, but isn't on the leaderboard.
- **Weekly leaderboard:** resets every Monday 00:00 UTC (the same weeks as the weekly quests). Each player's best ticketed run of the week counts; earlier runs win ties.
- **The pool:** every ticket's $CHOG goes into the pool contract, in the week it was paid. No fee (`config.tickets` can add one later, with a new contract).
- **Payout:** after the week ends and a 24-hour review, the top 10 share what the contract holds for that week:
  - 25%, 18%, 13%, 10%, 8%, 7%, 6%, 5%, 4%, 4% (`config.tickets.split`).
  - Shares nobody earns (fewer than 10 players), and anything not paid, roll over to later weeks.
- **Before a pool contract exists,** Chog NFT runs are ranked for free on the weekly board, as before.

## The pool contract (`contracts/ChogDashPool.sol`)

- `buyTickets(amount, ref)`: takes `amount` $CHOG (approved beforehand) into the current week's pool and emits `TicketsBought(player, week, amount, ref)`. `ref` is the server's quote id.
- `payWinners(week, winners[], amounts[])`: owner only, once per week, in order, only after the week ends. At most 10 winners, no duplicates, no zero amounts. It can only pay what isn't part of a later week's pool (`available(week)`), so the running week's money is never touched.
- `skipWeek(week)`: owner only; marks an empty week done (its pool rolls over).
- `transferOwnership(newOwner)`: for example to a multi-signature wallet later.
- No withdraw, no fee, nothing else can move tokens. Every purchase and payout is a public event on Monad.
- What it can't do: check scores. The owner sends the winners from the game's leaderboard; anyone can compare the `Payout` events with the published results (`GET /api/pool/results?week=`).
- Built with solc 0.8.26, optimizer on (200 runs), EVM version paris. `js/pool-artifact.js` holds the ABI and bytecode (`npm run build:pool`).
- Tested with Foundry (`forge test`: 14 tests) and on a fork of Monad mainnet with real $CHOG (`npm run test:fork`: deploy from the admin page, buy, ticket at take-off, weekly board, payout, rollover).
- Not professionally audited. Keep pools modest until it is.

## Trust model

- The server never holds keys and never moves money. Players pay from their own wallets; the owner pays winners from theirs.
- Tickets are credited only from a mined, successful transaction to the registered pool, from the signed-in wallet, matching one of its quotes (amount at least the quote, paid before the quote expired). Each transaction is credited once.
- Runs: the same checks as before (run time, possible distance, laser shots, ownership), with the run time now counted from take-off. Real money raises the stakes, so:
  - results stay in review for 24 hours after the week ends;
  - the owner can disqualify a player from a week before paying (`POST /api/pool/disqualify`);
  - these checks stop casual cheating, not a determined attacker who fakes plausible runs (see LEADERBOARD.md).
- Real-money contests are regulated differently by country and US state. Check the rules where your players are before growing the pool.

## For the owner: setting it up

1. **Database:** run `supabase/schema.sql` again in Supabase (it adds `chog_week_leaderboard` and the ticket counter).
2. **Owner wallet:** in Vercel, add the environment variable `POOL_ADMIN` = your wallet address (not a secret), then redeploy.
3. **Deploy:** open `/admin.html` on the live site, connect that wallet, sign in, press **Deploy pool contract** and approve it (a little MON for gas). The page registers the new contract with the game. Tickets are on sale straight away.
   - Optional: set `POOL_ADDRESS` in Vercel to pin the address.

## For the owner: every week

1. After Monday 00:00 UTC, open `/admin.html` and connect. It shows last week's top 10, each share and amount, and the review window.
2. Check the results. **Disqualify** anything impossible (it moves everyone below up).
3. After the review (Tuesday 00:00 UTC), press **Pay winners** and approve. Each winner receives their share in the same transaction; the rest rolls over.
   - A week with no players: **Skip week** rolls its pool over.

## API

- `GET /api/pool`: the contract, ticket price, this week, the prize now, last week's status, and (signed in) your tickets.
- `POST /api/tickets/quote { count }`: signed in, Chog holders. Returns `{ ref, amount, pool, expiresAt, ... }`.
- `POST /api/tickets/claim { txHash }`: credits a mined purchase. `{ status: "credited" | "pending", tickets }`.
- `POST /api/run/fly { runId }`: the rocket took off; spends a ticket. `{ ticketed, tickets }`.
- `GET /api/leaderboard?week=`: a week's board (this week by default).
- `GET /api/pool/results?week=`: a finished week's payout plan (last week by default). Public.
- `POST /api/pool/register { address }`, `POST /api/pool/disqualify { week, wallet, reason }`: pool owner only.
