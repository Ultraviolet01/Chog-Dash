/*
 * Server-side chain and metadata access. The server never trusts the client's ownership,
 * tier or trait claims: it reads them itself from the contract and the token's metadata.
 */
const { createPublicClient, http, defineChain, parseAbi, verifyMessage, parseEventLogs } = require("viem");
const config = require("../js/config.js");
const Meta = require("../js/metadata.js");
const Pool = require("../js/pool-artifact.js");

const C = config.collection;
const abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const erc20 = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

function createChain(rpcUrl) {
  const chain = defineChain({
    id: C.chainId, name: C.chainName, nativeCurrency: C.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 10000, retryCount: 1 }) });
  const read = (functionName, id) => client.readContract({ address: C.contract, abi, functionName, args: [BigInt(id)] });
  return {
    async ownerOf(tokenId) { return (await read("ownerOf", tokenId)).toLowerCase(); },
    tokenURI: tokenId => read("tokenURI", tokenId),
    balanceOf: wallet => client.readContract({ address: C.contract, abi, functionName: "balanceOf", args: [wallet] }),
    async fetchMetadata(uri) { return (await Meta.fetchJson(uri)).json; },
    verifySignature: ({ address, message, signature }) => verifyMessage({ address, message, signature }),

    // ---------- Pool contract and $CHOG ----------
    // A pool view function, e.g. pool(addr, "available", [week]) or pool(addr, "owner")
    pool: (address, functionName, args = []) => client.readContract({ address, abi: Pool.abi, functionName, args }),
    tokenBalance: (token, holder) => client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [holder] }),
    // The TicketsBought events of a mined, successful transaction to the pool (null if not mined yet)
    async ticketPurchases(txHash, poolAddress) {
      let receipt;
      try { receipt = await client.getTransactionReceipt({ hash: txHash }); }
      catch (e) { if (/not be found|not found/i.test(e.message)) return null; throw e; }
      if (receipt.status !== "success") return { failed: true, events: [] };
      const logs = receipt.logs.filter(l => l.address.toLowerCase() === poolAddress.toLowerCase());
      const events = parseEventLogs({ abi: Pool.abi, logs, eventName: "TicketsBought" }).map(e => ({
        player: e.args.player.toLowerCase(), week: Number(e.args.week), amount: e.args.amount, ref: e.args.ref.toLowerCase(),
      }));
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      return { failed: false, events, blockTime: Number(block.timestamp) * 1000 };
    },
    // $CHOG price in US dollars, from the most liquid Monad market on DexScreener
    async chogUsd() {
      const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + config.tickets.token, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error("price source " + res.status);
      const pairs = ((await res.json()).pairs || []).filter(p => p.chainId === "monad" && Number(p.priceUsd) > 0 &&
        p.baseToken && p.baseToken.address.toLowerCase() === config.tickets.token);
      pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      if (!pairs.length || ((pairs[0].liquidity && pairs[0].liquidity.usd) || 0) < 1000) throw new Error("no liquid $CHOG market");
      return Number(pairs[0].priceUsd);
    },
  };
}

module.exports = { createChain };
