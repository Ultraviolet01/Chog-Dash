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
      expectedSupply: 1969,
      metadataCid: "bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu",
      imageCid: "bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e",
      // UNVERIFIED: used only when asking a wallet to add the Monad network
      rpcUrls: ["https://rpc.monad.xyz"],
      explorerUrls: ["https://monadscan.com"],
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    },

    // Tried in order when an ipfs:// link fails to load
    ipfsGateways: [
      "https://ipfs.io/ipfs/",
      "https://w3s.link/ipfs/",
      "https://nftstorage.link/ipfs/",
      "https://gateway.pinata.cloud/ipfs/",
    ],
    fetchTimeoutMs: 12000,

    // GAME-DESIGN: which traits grant abilities. Matching is case-insensitive on trimmed strings;
    // the original strings are always kept for display. Any value that matches no rule gets no ability.
    abilities: {
      laserEyes: {
        label: "Laser Eyes",
        trait: "Eyes",
        // PROVISIONAL: any Eyes value containing "laser". Confirm the exact values with
        // scripts/audit-metadata.js before launch, then replace with an explicit list if needed.
        match: { contains: ["laser"], exact: [] },
        charges: 10,
      },
    },

    // GAME-DESIGN: score multiplier per Tier value. Not part of the collection's own rules.
    tiers: {
      trait: "Tier",
      multipliers: { common: 1.0, uncommon: 1.05, rare: 1.15, epic: 1.25, legendary: 1.4 },
      unknownMultiplier: 1.0, // safe default for a missing or unrecognised Tier value
    },

    // Shared game tuning. The server uses the speed values to bound what distance is possible.
    game: {
      unitsPerMeter: 2,
      baseSpeed: 40,
      // Speed rises quickly to rampSpeed, then keeps rising for the rest of the run, more slowly the
      // further you go: speed = rampSpeed + lateGrowth * sqrt(meters past the ramp). See traits.speedAt.
      speedPerMeter: 0.06,
      rampSpeed: 110,
      lateGrowth: 0.4,
      laserRange: 140,
      laserRadius: 0.9,
      // The run is split into zones that repeat in this order (loop after Milky Way).
      // Zone lengths grow: 2, 4, 8, 14, 22, 32, 44 ... minutes, i.e. length(k) = first + growth * k(k+1)/2
      // for the k-th zone of the run (k = 0, 1, 2 ...). Times are converted to distance with the speed curve.
      // Pickups (js/pickups.js). The server uses the Dash values to bound possible distance.
      pickups: {
        firstAt: 10,            // seconds into a run before anything spawns
        powerGapMin: 20, powerGapMax: 30,   // seconds between power-ups
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

    leaderboard: {
      apiBase: "/api",
      // Ranking rule: one entry per NFT (its best validated score). The wallet is shown alongside.
      rankBy: "token",
      size: 50,
    },

    // Score = floor(raw distance in meters x tier multiplier)
    scoreFormula: "Score = distance (m) x tier multiplier, rounded down",
  };
});
