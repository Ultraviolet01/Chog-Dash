/*
 * The 5 demo Chogs (see js/demo.js): real Chog Genesis NFTs, one per tier. Their metadata is embedded (copied from
 * the collection's tokenURI JSON) so the demo needs no chain calls. Shared by the browser and the server, which
 * scores demo runs for the DEMO leaderboard from this same metadata.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ChogDemoChogs = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // tokenId: the contract token ID. blurb: what this Chog shows off.
  return [
    {
      tokenId: "68",
      blurb: "Laser Eyes (fire laser) and a Fiery Aura flame trail",
      metadata: {
        name: "CHOG #1529",
        description: "CHOG — a 1969-piece collection on Monad.",
        image: "ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/1529.webp",
        attributes: [
          {"trait_type":"Background","value":"Light Purple"},
          {"trait_type":"Aura","value":"Fiery Aura"},
          {"trait_type":"Base","value":"Origin"},
          {"trait_type":"Skin","value":"Yellow"},
          {"trait_type":"Side","value":"Right"},
          {"trait_type":"Body","value":"Astro Suit"},
          {"trait_type":"Mouth","value":"wo"},
          {"trait_type":"Eyes","value":"fire laser"},
          {"trait_type":"Form","value":"Chog"},
          {"trait_type":"Tier","value":"Common"},
          {"trait_type":"Naked","value":"No"},
        ],
      },
    },
    {
      tokenId: "248",
      blurb: "No laser: a Wind aura trail of fast streaks",
      metadata: {
        name: "CHOG #1709",
        description: "CHOG — a 1969-piece collection on Monad.",
        image: "ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/1709.webp",
        attributes: [
          {"trait_type":"Background","value":"Sunlight"},
          {"trait_type":"Aura","value":"Wind"},
          {"trait_type":"Base","value":"Origin"},
          {"trait_type":"Skin","value":"Pink"},
          {"trait_type":"Side","value":"Left"},
          {"trait_type":"Body","value":"Pink Shirt"},
          {"trait_type":"Mouth","value":"Grit"},
          {"trait_type":"Eyes","value":"Modern VR"},
          {"trait_type":"Head","value":"10k TPS Cap"},
          {"trait_type":"Accessory","value":"SB"},
          {"trait_type":"Form","value":"Chog"},
          {"trait_type":"Tier","value":"Uncommon"},
          {"trait_type":"Naked","value":"No"},
        ],
      },
    },
    {
      tokenId: "1832",
      blurb: "Laser Eyes (purple laser), a Skull rocket and an Electric Shock trail",
      metadata: {
        name: "CHOG #1324",
        description: "CHOG — a 1969-piece collection on Monad.",
        image: "ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/1324.webp",
        attributes: [
          {"trait_type":"Background","value":"Supreme Purple"},
          {"trait_type":"Aura","value":"Electric Shock"},
          {"trait_type":"Base","value":"Skull"},
          {"trait_type":"Skin","value":"Beige"},
          {"trait_type":"Side","value":"Right"},
          {"trait_type":"Body","value":"Stripe Shirt"},
          {"trait_type":"Eyes","value":"Purple laser"},
          {"trait_type":"Head","value":"Chog Cap"},
          {"trait_type":"Form","value":"Skull"},
          {"trait_type":"Tier","value":"Rare"},
          {"trait_type":"Naked","value":"No"},
        ],
      },
    },
    {
      tokenId: "1106",
      blurb: "No laser: a glowing Radioactive rocket and an Aqua Aura water trail",
      metadata: {
        name: "CHOG #598",
        description: "CHOG — a 1969-piece collection on Monad.",
        image: "ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/598.webp",
        attributes: [
          {"trait_type":"Background","value":"Radioactive"},
          {"trait_type":"Aura","value":"Aqua Aura"},
          {"trait_type":"Base","value":"Radioactive"},
          {"trait_type":"Skin","value":"Blue"},
          {"trait_type":"Side","value":"Left"},
          {"trait_type":"Body","value":"dark jacket"},
          {"trait_type":"Eyes","value":"Blue Retard"},
          {"trait_type":"Head","value":"3rd Eye"},
          {"trait_type":"Form","value":"Chog"},
          {"trait_type":"Tier","value":"Epic"},
          {"trait_type":"Naked","value":"No"},
        ],
      },
    },
    {
      tokenId: "1798",
      blurb: "No laser: a one-of-one Legendary rocket with a crown, x1.40 score",
      metadata: {
        name: "CHOG #1290 — Krown",
        description: "CHOG — a 1969-piece collection on Monad.",
        image: "ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/1290.webp",
        attributes: [
          {"trait_type":"Base","value":"1:1"},
          {"trait_type":"Tier","value":"Legendary"},
        ],
      },
    },
  ];
});
