/*
 * Minimal wallet and contract access over EIP-1193 (no library needed).
 * Reads go through the connected wallet's provider, so no public RPC is needed in the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else root.ChogChain = factory(root.ChogConfig);
})(typeof self !== "undefined" ? self : this, function (config) {
  const C = config.collection;

  // Function selectors (first 4 bytes of keccak256 of the signature)
  const SEL = {
    ownerOf: "0x6352211e",             // ownerOf(uint256)
    balanceOf: "0x70a08231",           // balanceOf(address)
    tokenOfOwnerByIndex: "0x2f745c59", // tokenOfOwnerByIndex(address,uint256)
    tokenURI: "0xc87b56dd",            // tokenURI(uint256)
    supportsInterface: "0x01ffc9a7",   // supportsInterface(bytes4)
    totalSupply: "0x18160ddd",         // totalSupply()
  };
  const IFACE = { erc721: "0x80ac58cd", enumerable: "0x780e9d63", metadata: "0x5b5e139f" };

  const hex = n => "0x" + BigInt(n).toString(16);
  const pad32 = h => h.replace(/^0x/, "").padStart(64, "0");
  const encUint = n => pad32(BigInt(n).toString(16));
  const encAddr = a => pad32(a.toLowerCase().replace(/^0x/, ""));
  const encBytes4 = b => b.replace(/^0x/, "").padEnd(64, "0");

  function decodeUint(data) {
    if (!data || data === "0x") throw new Error("Empty response from contract");
    return BigInt("0x" + data.replace(/^0x/, "").slice(0, 64));
  }
  function decodeAddress(data) {
    if (!data || data.length < 66) throw new Error("Empty response from contract");
    return "0x" + data.replace(/^0x/, "").slice(24, 64).toLowerCase();
  }
  function decodeBool(data) { return decodeUint(data) !== 0n; }
  function decodeString(data) {
    const h = (data || "").replace(/^0x/, "");
    if (h.length < 128) throw new Error("Malformed string response");
    const offset = Number(BigInt("0x" + h.slice(0, 64))) * 2;
    const len = Number(BigInt("0x" + h.slice(offset, offset + 64)));
    const body = h.slice(offset + 64, offset + 64 + len * 2);
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = parseInt(body.substr(i * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  }

  async function call(provider, data) {
    return provider.request({ method: "eth_call", params: [{ to: C.contract, data }, "latest"] });
  }

  const reads = {
    ownerOf: (p, id) => call(p, SEL.ownerOf + encUint(id)).then(decodeAddress),
    balanceOf: (p, owner) => call(p, SEL.balanceOf + encAddr(owner)).then(decodeUint),
    tokenOfOwnerByIndex: (p, owner, i) => call(p, SEL.tokenOfOwnerByIndex + encAddr(owner) + encUint(i)).then(decodeUint),
    tokenURI: (p, id) => call(p, SEL.tokenURI + encUint(id)).then(decodeString),
    totalSupply: p => call(p, SEL.totalSupply).then(decodeUint),
    supportsInterface: (p, iface) => call(p, SEL.supportsInterface + encBytes4(iface)).then(decodeBool).catch(() => false),
  };

  // ---------- Wallet discovery (EIP-6963, with window.ethereum as a fallback) ----------
  const discovered = [];
  if (typeof window !== "undefined") {
    window.addEventListener("eip6963:announceProvider", e => {
      const d = e.detail;
      if (d && d.provider && !discovered.some(w => w.info.uuid === d.info.uuid)) discovered.push(d);
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }
  function listWallets() {
    if (discovered.length) return discovered.map(d => ({ name: d.info.name, icon: d.info.icon, provider: d.provider }));
    if (typeof window !== "undefined" && window.ethereum) return [{ name: "Browser wallet", icon: null, provider: window.ethereum }];
    return [];
  }

  async function connect(provider) {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("The wallet returned no accounts");
    const chainId = Number(await provider.request({ method: "eth_chainId" }));
    return { account: accounts[0].toLowerCase(), chainId };
  }

  async function switchToMonad(provider) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex(C.chainId) }] });
    } catch (e) {
      if (e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902))) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hex(C.chainId), chainName: C.chainName, rpcUrls: C.rpcUrls,
            nativeCurrency: C.nativeCurrency, blockExplorerUrls: C.explorerUrls }],
        });
      } else throw e;
    }
  }

  // Lists owned token IDs. Uses ERC-721 enumeration when the contract supports it;
  // otherwise returns { enumerable: false } so the UI can ask for a token ID instead.
  async function listOwnedTokens(provider, owner, limit) {
    const balance = await reads.balanceOf(provider, owner);
    const enumerable = await reads.supportsInterface(provider, IFACE.enumerable);
    if (!enumerable) return { balance, enumerable: false, tokenIds: [] };
    const n = Math.min(Number(balance), limit || 50);
    const tokenIds = [];
    for (let i = 0; i < n; i++) tokenIds.push(await reads.tokenOfOwnerByIndex(provider, owner, i));
    return { balance, enumerable: true, tokenIds };
  }

  // ---------- Finding a wallet's Chogs without ERC-721 enumeration ----------
  // The contract can't list a wallet's tokens, so we ask ownerOf for every token ID through
  // Multicall3 (one eth_call per batch) and keep the ones owned by this wallet.
  const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
  const AGGREGATE3 = "0x82ad56cb";   // aggregate3((address,bool,bytes)[])

  function encodeAggregate3(target, calls) {
    // Each call is a static-size tuple tail: target, allowFailure, bytes offset, bytes length, 64 bytes of data
    const n = calls.length, parts = [pad32("20"), encUint(n)];
    for (let i = 0; i < n; i++) parts.push(encUint(n * 32 + i * 192));
    for (const data of calls) {
      const d = data.replace(/^0x/, "");
      if (d.length > 128) throw new Error("Call data too long for this encoder");
      parts.push(encAddr(target), encUint(1), encUint(0x60), encUint(d.length / 2), d.padEnd(128, "0"));
    }
    return AGGREGATE3 + parts.join("");
  }

  // Returns [{ success, data }] from an aggregate3 result
  function decodeAggregate3(result) {
    const h = (result || "").replace(/^0x/, "");
    const word = at => BigInt("0x" + h.slice(at * 2, at * 2 + 64));
    const arr = Number(word(0)), n = Number(word(arr)), base = arr + 32, out = [];
    for (let i = 0; i < n; i++) {
      const el = base + Number(word(base + i * 32));
      const success = word(el) !== 0n;
      const off = el + Number(word(el + 32)), len = Number(word(off));
      out.push({ success, data: "0x" + h.slice((off + 32) * 2, (off + 32 + len) * 2) });
    }
    return out;
  }

  // Scans token IDs [first..last] and returns the ones `owner` holds.
  // Stops early once it has found `balanceOf(owner)` tokens.
  async function findOwnedTokens(provider, owner, opts) {
    const o = opts || {};
    const me = owner.toLowerCase();
    const balance = Number(await reads.balanceOf(provider, owner));
    if (balance === 0) return { balance, tokenIds: [], complete: true };
    const first = o.first || C.firstTokenId || 1;
    const last = o.last || Number(await reads.totalSupply(provider)) + first - 1;
    const batch = o.batchSize || 400;
    const found = [];
    for (let start = first; start <= last && found.length < balance; start += batch) {
      const ids = [];
      for (let id = start; id <= Math.min(last, start + batch - 1); id++) ids.push(id);
      const data = encodeAggregate3(C.contract, ids.map(id => SEL.ownerOf + encUint(id)));
      const res = decodeAggregate3(await provider.request({ method: "eth_call", params: [{ to: MULTICALL3, data }, "latest"] }));
      res.forEach((r, i) => { if (r.success && r.data.length >= 66 && decodeAddress(r.data) === me) found.push(String(ids[i])); });
      if (o.onProgress) o.onProgress(Math.min(last, start + batch - 1) - first + 1, last - first + 1, found.length);
    }
    return { balance, tokenIds: found, complete: found.length === balance };
  }

  async function verifyOwnership(provider, tokenId, owner) {
    let actual;
    try { actual = await reads.ownerOf(provider, tokenId); }
    catch (e) { return { owned: false, reason: "Token " + tokenId + " does not exist or could not be read" }; }
    return actual === owner.toLowerCase()
      ? { owned: true, owner: actual }
      : { owned: false, owner: actual, reason: "This wallet does not own token " + tokenId };
  }

  return { SEL, IFACE, MULTICALL3, reads, listWallets, connect, switchToMonad, listOwnedTokens, findOwnedTokens,
    encodeAggregate3, decodeAggregate3, verifyOwnership,
    decodeString, decodeAddress, decodeUint };
});
