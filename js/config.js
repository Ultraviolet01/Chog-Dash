/*
 * Chog Dash shared configuration.
 * Loaded by the browser (as window.ChogConfig) and by the server and scripts (require).
 *
 * Anything marked GAME-DESIGN is a Chog Dash decision, not an official Chog Genesis rule.
 * Anything marked UNVERIFIED has not yet been checked against the live chain or metadata.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChogConfig = factory();
})(typeof self !== "undefined" ? self : this, function () {
  return {
    collection: {
      name: "Chog Genesis",
      openseaUrl: "https://opensea.io/collection/chog-genesis",
      // UNVERIFIED: supplied in the spec; confirm with scripts/verify-contract.js
      chainId: 143,
      chainName: "Monad",
      contract: "0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763",
      firstTokenId: 1,                 // verified: token IDs run 1..1969 (token 0 reverts)
      expectedSupply: 1969,
      metadataCid: "bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu",
      imageCid: "bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e",
      // UNVERIFIED: used only when asking a wallet to add the Monad network
      rpcUrls: ["https://rpc.monad.xyz"],
      explorerUrls: ["https://monadscan.com"],
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    },

    // Tried in order when an ipfs:// link fails to load
    // Order checked against the live collection: filebase is fast and allows cross-site image use;
    // ipfs.io and the w3s/nftstorage subdomain gateways rate-limit heavily, so they come last.
    ipfsGateways: [
      "https://ipfs.filebase.io/ipfs/",
      "https://gateway.pinata.cloud/ipfs/",
      "https://ipfs.io/ipfs/",
      "https://w3s.link/ipfs/",
      "https://nftstorage.link/ipfs/",
    ],
    fetchTimeoutMs: 12000,

    // GAME-DESIGN: which traits grant abilities. Matching is case-insensitive on trimmed strings;
    // the original strings are always kept for display. Any value that matches no rule gets no ability.
    abilities: {
      laserEyes: {
        label: "Laser Eyes",
        trait: "Eyes",
        // Checked against all 1,969 tokens (docs/TRAIT-AUDIT.md): these are the only four Eyes
        // values with a laser, 277 tokens in total. An explicit list so a new value never
        // grants the ability by accident.
        match: { contains: [], exact: ["Purple laser", "fire laser", "Green laser", "cyan laser"] },
        charges: 10,
      },
    },

    // GAME-DESIGN: score multiplier per Tier value. Not part of the collection's own rules.
    tiers: {
      trait: "Tier",
      multipliers: { common: 1.0, uncommon: 1.05, rare: 1.15, epic: 1.25, legendary: 1.4 },
      unknownMultiplier: 1.0, // safe default for a missing or unrecognised Tier value
    },

    // GAME-DESIGN: trait of the week. Each week (Monday 00:00 UTC, the same weeks as the leaderboard) one group of
    // traits is featured, in this order, and Chogs with it get `bonus` on top of their tier multiplier. Counts are
    // tokens out of 1,969 (docs/TRAIT-AUDIT.md). Matching works like the abilities above; `any: true` matches any value.
    weeklyTrait: {
      bonus: 1.1,
      rotation: [
        { id: "fire", label: "Fire Auras", trait: "Aura", match: { exact: ["Burning Aura", "Fiery Aura", "Fire"] } },            // 202
        { id: "laser", label: "Laser Eyes", trait: "Eyes", match: { exact: ["Purple laser", "fire laser", "Green laser", "cyan laser"] } },   // 277
        { id: "pink", label: "Pink Skin", trait: "Skin", match: { exact: ["Pink"] } },                                         // 557
        { id: "skull", label: "Skull & Radioactive", trait: "Base", match: { exact: ["Skull", "Radioactive"] } },              // 90
        { id: "purple", label: "Purple Skies", trait: "Background", match: { contains: ["purple", "lavender", "magenta"] } },   // 369
        { id: "red", label: "Red Skin", trait: "Skin", match: { exact: ["Red"] } },                                            // 299
        { id: "elements", label: "Water, Wind & Smoke", trait: "Aura", match: { exact: ["Aqua Aura", "Wind", "Smoke"] } },      // 184
        { id: "accessory", label: "Accessories", trait: "Accessory", match: { any: true } },                                  // 195
        { id: "black", label: "Black Skin", trait: "Skin", match: { exact: ["Black"] } },                                      // 263
        { id: "blue", label: "Blue Skies", trait: "Background", match: { contains: ["aqua", "blue"] } },                       // 382
        { id: "yellow", label: "Yellow Skin", trait: "Skin", match: { exact: ["Yellow"] } },                                   // 246
        { id: "left", label: "Left-Facing Chogs", trait: "Side", match: { exact: ["Left"] } },                                 // 650
      ],
    },

    // Shared game tuning. The server uses the speed values to bound what distance is possible.
    game: {
      unitsPerMeter: 2,
      baseSpeed: 40,
      // Speed rises quickly to rampSpeed, then keeps rising for the rest of the run, more slowly the
      // further you go: speed = rampSpeed + lateGrowth * sqrt(meters past the ramp). See traits.speedAt.
      speedPerMeter: 0.03,   // a gentle ramp: about 1 minute to reach rampSpeed
      rampSpeed: 100,
      lateGrowth: 0.25,
      laserRange: 140,
      laserRadius: 0.9,
      // The run is split into zones that repeat in this order (loop after Milky Way).
      // Zone lengths grow: 2, 4, 8, 14, 22, 32, 44 ... minutes, i.e. length(k) = first + growth * k(k+1)/2
      // for the k-th zone of the run (k = 0, 1, 2 ...). Times are converted to distance with the speed curve.
      // Pickups (js/pickups.js). The server uses the Dash values to bound possible distance.
      pickups: {
        firstAt: 10,            // seconds into a run before anything spawns
        powerGapMin: 12, powerGapMax: 18,   // seconds between power-ups
        dashSeconds: 3, dashSpeedMult: 1.8,
        magnetSeconds: 10, magnetRadius: 14,
        slowSeconds: 6, slowSpeedMult: 0.6,
        radarSeconds: 12,
        stardustPerLife: 100, maxLives: 3, hornStardust: 50,
        reviveSeconds: 2,
      },
      zoneFirstMinutes: 2,
      zoneGrowthMinutes: 2,
      zones: [
        { id: "outer", name: "Outer Space" },
        { id: "belt", name: "Asteroid Belt" },
        { id: "drift", name: "Galactic Drift" },
        { id: "deep", name: "Deep Cosmic Zone" },
        { id: "milky", name: "Milky Way" },
      ],
    },

    // Tickets and the weekly prize pool (Chog NFT mode). GAME-DESIGN.
    // One ticket = one ranked Chog NFT run, paid in $CHOG into the pool contract (contracts/ChogDashPool.sol).
    // All ticket money goes to the week's pool (no fee); after the week the top 10 share it by `split` (percent).
    tickets: {
      token: "0x350035555e10d9afaf1566aaebfced5ba6c27777",   // verified: name Chog, symbol CHOG, 18 decimals, on Monad
      symbol: "CHOG",
      decimals: 18,
      priceUsd: 0.5,                // one ticket
      split: [25, 18, 13, 10, 8, 7, 6, 5, 4, 4],   // rank 1..10; shares nobody earns roll over to the next week
      maxPerBuy: 20,
      quoteSeconds: 600,            // a price quote can be paid within 10 minutes
      reviewHours: 24,              // after a week ends, results can be checked before the payout
      buyUrl: "https://nad.fun/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777",
    },

    leaderboard: {
      apiBase: "/api",
      // Ranking rule: one entry per player (username), by best total distance (distance x tier multiplier)
      rankBy: "player",
      size: 50,
    },

    // Total distance = floor(raw distance in meters x tier multiplier x trait-of-the-week bonus). This is what the leaderboard ranks.
    scoreFormula: "Total distance = distance flown (m) x tier multiplier (x the trait-of-the-week bonus when the Chog has it), rounded down. The leaderboard ranks this",
  };
});
