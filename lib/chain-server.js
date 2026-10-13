/*
 * Server-side chain and metadata access. The server never trusts the client's ownership,
 * tier or trait claims: it reads them itself from the contract and the token's metadata.
 */
const { createPublicClient, http, defineChain, parseAbi, verifyMessage } = require("viem");
const config = require("../js/config.js");
const Meta = require("../js/metadata.js");

const C = config.collection;
const abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

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
    async fetchMetadata(uri) { return (await Meta.fetchJson(uri)).json; },
    verifySignature: ({ address, message, signature }) => verifyMessage({ address, message, signature }),
  };
}

module.exports = { createChain };
