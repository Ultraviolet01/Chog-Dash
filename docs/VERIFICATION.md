# Verification status

Last updated with the v0.2 build. Nothing below is marked verified unless it was actually checked.

## Not yet verified against the live collection

The build environment could not reach any Monad RPC endpoint or IPFS gateway (blocked by its network policy), so none of these could be checked:

- Contract address `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` is the Chog Genesis contract.
- Chain ID `143` (Monad mainnet).
- ERC-721 support, and whether the contract supports ERC-721 enumeration.
- Total supply of 1,969.
- Token ID range (whether IDs start at 0 or 1) and that the number in an NFT's name matches its token ID. The game never assumes this.
- tokenURI format and that it points at metadata CID `bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu`.
- Image references and that they point at image CID `bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e`.
- Metadata structure (attribute names such as `Eyes` and `Tier`, and their values).
- Which Eyes values should grant Laser Eyes. The current rule ("Eyes contains laser") is provisional.
- Tier values and counts. Earlier counts came from 1,945 of 1,969 files and are not final.
- Whether NFT images have transparent or baked-in backgrounds.
- The Monad RPC URL and explorer URL in `js/config.js` (only used when asking a wallet to add the network, and as the server's default RPC).

## How to verify

1. `npm run verify-contract` and review `data/contract-report.json`.
2. `npm run audit-metadata` and review `docs/TRAIT-AUDIT.md`:
   - Check it says "complete" (every token loaded).
   - Review every Eyes value and the "Needs review" column, then update `abilities.laserEyes.match` in `js/config.js` if needed.
   - Check every Tier value has a multiplier.
3. Test in a real wallet with a few of the representative tokens the audit lists (different tiers, with and without Laser Eyes).
4. Look at several NFT images in the game to confirm the rider looks right (see docs/ART.md).

## Tested in the build environment

- Unit and API tests (`npm test`, 25 tests, plus `npm run test:browser`): trait mapping, tier scoring, contract call encoding and decoding, gateway fallback, sign-in, run validation, leaderboard ranking.
- Headless browser runs (Chromium, software WebGL):
  - Practice mode start, flight, crash and restart.
  - Laser Eyes: destroys in-path obstacles, is blocked by huge asteroids, leaves off-path and out-of-range obstacles, stops at 0 charges.
  - Full NFT flow against a mock wallet, mock contract and mock IPFS: connect, ownership rejection for a token the wallet doesn't own, token ID entry and enumerable listing, metadata and traits display, rider artwork, sign-in, eligible run, server validation, leaderboard entry.
- Not tested: real wallets (MetaMask, Rabby and others), the real contract, real metadata and images, mobile devices, Vercel deployment, Upstash storage.
