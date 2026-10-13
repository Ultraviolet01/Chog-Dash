/*
 * Verifies the Chog Genesis contract against the live chain.
 *   node scripts/verify-contract.js            (uses MONAD_RPC_URL or the default RPC in js/config.js)
 * Writes data/contract-report.json and prints a summary. Nothing is assumed: every value is read.
 */
const fs = require("fs");
const path = require("path");
const { createPublicClient, http, parseAbi } = require("viem");
const config = require("../js/config.js");

const C = config.collection;
const rpc = process.env.MONAD_RPC_URL || C.rpcUrls[0];
const abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function tokenByIndex(uint256) view returns (uint256)",
]);

async function main() {
  const client = createPublicClient({ transport: http(rpc, { timeout: 15000 }) });
  const report = { checkedAt: new Date().toISOString(), rpc, contract: C.contract, checks: {}, problems: [] };
  const read = async (functionName, args = []) => {
    try { return { ok: true, value: await client.readContract({ address: C.contract, abi, functionName, args }) }; }
    catch (e) { return { ok: false, error: e.shortMessage || e.message }; }
  };
  const ck = (k, v) => { report.checks[k] = v; console.log(k.padEnd(28), JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x)); };

  const chainId = await client.getChainId();
  ck("chainId", chainId);
  if (chainId !== C.chainId) report.problems.push("RPC chain ID " + chainId + " does not match expected " + C.chainId);

  const code = await client.getBytecode({ address: C.contract });
  ck("hasContractCode", !!(code && code !== "0x"));
  if (!code || code === "0x") report.problems.push("No contract code at " + C.contract);

  ck("name", await read("name"));
  ck("symbol", await read("symbol"));
  const supply = await read("totalSupply");
  ck("totalSupply", supply);
  if (supply.ok && Number(supply.value) !== C.expectedSupply) report.problems.push("totalSupply " + supply.value + " differs from expected " + C.expectedSupply);

  for (const [k, id] of Object.entries({ erc721: "0x80ac58cd", erc721Metadata: "0x5b5e139f", erc721Enumerable: "0x780e9d63" })) {
    ck("supports." + k, await read("supportsInterface", [id]));
  }

  // Token ID range: never assume IDs start at 0 or 1, or match the number in an NFT's name
  const probe = async id => ({ id, owner: await read("ownerOf", [BigInt(id)]), uri: await read("tokenURI", [BigInt(id)]) });
  const n = supply.ok ? Number(supply.value) : C.expectedSupply;
  const probes = [];
  for (const id of [0, 1, n - 1, n, n + 1]) probes.push(await probe(id));
  ck("tokenProbes", probes.map(p => ({ id: p.id, exists: p.owner.ok, tokenURI: p.uri.ok ? p.uri.value : p.uri.error })));
  const exists = probes.filter(p => p.owner.ok).map(p => p.id);
  const first = exists.includes(0) ? 0 : exists.includes(1) ? 1 : null;
  report.tokenIdRange = first == null ? null : { first, last: first + n - 1 };
  ck("tokenIdRange (inferred)", report.tokenIdRange);

  const enumerable = report.checks["supports.erc721Enumerable"];
  if (enumerable && enumerable.ok && enumerable.value) {
    ck("tokenByIndex(0)", await read("tokenByIndex", [0n]));
  }

  const sample = probes.find(p => p.uri.ok);
  if (sample) {
    const uri = sample.uri.value;
    ck("tokenURI uses metadata CID", uri.includes(C.metadataCid));
    if (!uri.includes(C.metadataCid)) report.problems.push("tokenURI does not use the expected metadata CID: " + uri);
  }

  console.log("\nProblems:", report.problems.length ? "\n- " + report.problems.join("\n- ") : "none");
  fs.mkdirSync(path.join(__dirname, "../data"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "../data/contract-report.json"),
    JSON.stringify(report, (_, x) => typeof x === "bigint" ? x.toString() : x, 2));
  console.log("Saved data/contract-report.json");
}

main().catch(e => { console.error("Verification failed:", e.shortMessage || e.message); process.exit(1); });
