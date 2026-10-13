# Leaderboard

## Ranking

- One entry per NFT: each Chog's best validated score. The wallet that set it is shown alongside.
- Score = distance (m) x tier multiplier, rounded down. Raw distance and the multiplier are stored and shown separately.
- Practice runs are never submitted.

## Flow

1. Sign-in: the server issues a one-time message. The wallet signs it (free, no transaction). The server checks the signature and returns a 12-hour sign-in token.
2. Run start (each time the ready screen shows): the server checks on-chain that the wallet owns the token, reads the token's metadata itself, and records the tier, multiplier and laser charges in a run session.
3. Run finish: the client sends distance, run time and laser shots. The server:
   - accepts each run only once, from the same wallet;
   - rejects a run time longer than the session has existed;
   - rejects a distance faster than the game allows (top speed with constant boosting);
   - rejects more laser shots than the Chog's charges;
   - re-checks ownership on-chain;
   - computes the score with its own multiplier, ignoring anything the client claims.
4. Every submission is stored with wallet, token ID, raw distance, final score, tier, multiplier and validation status (validated or rejected, with the reason).

## Limits (honest)

- These checks stop casual cheating. They can't prove a run was really played: someone who scripts plausible distances can still submit them.
- Stronger options for later: record inputs and the obstacle seed and replay the run on the server, or add rate limits and review of outlier scores.

## Storage

- Production: Upstash Redis via `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- Without them the server keeps data in memory, which is lost on restart (fine for local testing only).
