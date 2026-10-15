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

  // ---------- Wallets: MetaMask, Rabby and Phantom only ----------
  // Found through EIP-6963 (each wallet announces itself by its rdns), with the older window.ethereum flags as a
  // fallback. Other installed wallets are not listed. Logos: web3icons (MIT), as data URLs so they need no request.
  const ICONS = {
      "metamask": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cg%20clip-path%3D%22url(%23metamask__a)%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M24%200H0v24h24z%22%2F%3E%3Cpath%20fill%3D%22%23FF5C16%22%20d%3D%22m18.9%2018.925-3.434-.993-2.59%201.504h-1.807l-2.592-1.504-3.433.993L4%2015.5l1.044-3.802L4%208.484%205.044%204.5l5.365%203.114h3.127L18.9%204.5l1.045%203.984-1.045%203.214%201.045%203.802z%22%2F%3E%3Cpath%20fill%3D%22%23FF5C16%22%20d%3D%22m5.045%204.5%205.364%203.116-.213%202.14zm3.433%2011.001%202.36%201.747-2.36.684zm2.172-2.888-.454-2.856-2.904%201.942h-.001l.009%202%201.177-1.086zM18.9%204.5l-5.364%203.116.213%202.14zm-3.433%2011.001-2.36%201.747%202.36.684zm1.187-3.801v-.002h-.001l-2.904-1.941-.453%202.856h2.171l1.178%201.086z%22%2F%3E%3Cpath%20fill%3D%22%23E34807%22%20d%3D%22m8.477%2017.932-3.433.993L4%2015.501h4.477zm2.172-5.32.656%204.13-.91-2.297-3.097-.746%201.178-1.087zm4.818%205.32%203.433.993%201.045-3.424h-4.478zm-2.171-5.32-.656%204.13.909-2.297%203.097-.746-1.179-1.087z%22%2F%3E%3Cpath%20fill%3D%22%23FF8D5D%22%20d%3D%22m4%2015.5%201.044-3.802H7.29l.008%202%203.098.747.909%202.296-.468.505-2.36-1.747zm15.945%200L18.9%2011.698h-2.245l-.009%202-3.097.747-.909%202.296.467.505%202.36-1.747zm-6.409-7.886h-3.127l-.213%202.139%201.109%206.985h1.335l1.11-6.985z%22%2F%3E%3Cpath%20fill%3D%22%23661800%22%20d%3D%22M5.044%204.5%204%208.484l1.044%203.214H7.29l2.905-1.943zM10%2013.441H8.982l-.553.528%201.967.474zM18.9%204.5l1.045%203.984-1.045%203.214h-2.245l-2.906-1.943zm-4.954%208.941h1.02l.553.529-1.97.475zm-1.071%204.632.232-.825-.467-.506h-1.336l-.467.506.232.825%22%2F%3E%3Cpath%20fill%3D%22%23C0C4CD%22%20d%3D%22M12.875%2018.073v1.364h-1.806v-1.364z%22%2F%3E%3Cpath%20fill%3D%22%23E7EBF6%22%20d%3D%22m8.478%2017.93%202.592%201.506v-1.363l-.232-.826zm6.99%200-2.593%201.506v-1.363l.232-.826z%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3CclipPath%20id%3D%22metamask__a%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h24v24H0z%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E",
      "rabby": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cg%20clip-path%3D%22url(%23rabby__a)%22%3E%3Cpath%20fill%3D%22url(%23rabby__b)%22%20d%3D%22M24%200H0v24h24z%22%2F%3E%3Cpath%20fill%3D%22url(%23rabby__c)%22%20d%3D%22M19.918%2013.04c.629-1.461-2.478-5.543-5.446-7.243-1.87-1.317-3.82-1.136-4.215-.558-.866%201.27%202.869%202.345%205.367%203.6a2.9%202.9%200%200%200-1.34%201.235c-.932-1.058-2.976-1.969-5.375-1.235-1.616.495-2.96%201.66-3.479%203.422a1%201%200%200%200-.412-.091c-.562%200-1.018.474-1.018%201.059s.456%201.059%201.018%201.059c.104%200%20.43-.073.43-.073l5.204.04c-2.082%203.435-3.726%203.937-3.726%204.532s1.573.434%202.164.212c2.83-1.062%205.868-4.372%206.389-5.325%202.19.284%204.03.318%204.44-.634%22%2F%3E%3Cpath%20fill%3D%22url(%23rabby__d)%22%20fill-rule%3D%22evenodd%22%20d%3D%22M15.624%208.839c.116-.048.097-.225.066-.365-.073-.321-1.334-1.617-2.518-2.197-1.614-.791-2.802-.75-2.978-.386.329.701%201.853%201.36%203.444%202.047.679.293%201.37.591%201.986.901%22%20clip-rule%3D%22evenodd%22%2F%3E%3Cpath%20fill%3D%22url(%23rabby__e)%22%20fill-rule%3D%22evenodd%22%20d%3D%22M13.576%2015.894a9%209%200%200%200-1.114-.357c.447-.832.541-2.064.119-2.843-.592-1.092-1.336-1.674-3.063-1.674-.95%200-3.508.333-3.554%202.555q-.008.349.016.644l4.672.035a16.7%2016.7%200%200%201-1.736%202.397c.62.165%201.131.304%201.601.431.446.121.854.232%201.28.345a20%2020%200%200%200%201.78-1.533%22%20clip-rule%3D%22evenodd%22%2F%3E%3Cpath%20fill%3D%22url(%23rabby__f)%22%20d%3D%22M5.368%2013.99c.19%201.688%201.113%202.35%202.997%202.545%201.884.196%202.964.065%204.403.201%201.202.114%202.275.751%202.673.53.358-.197.157-.913-.322-1.372-.621-.596-1.481-1.01-2.994-1.157.301-.859.217-2.063-.251-2.719-.678-.947-1.927-1.376-3.51-1.189-1.652.196-3.235%201.043-2.996%203.161%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22rabby__b%22%20x1%3D%228.721%22%20x2%3D%2219.846%22%20y1%3D%2211.746%22%20y2%3D%2214.778%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%238697FF%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ABB7FF%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22rabby__c%22%20x1%3D%228.721%22%20x2%3D%2219.846%22%20y1%3D%2211.746%22%20y2%3D%2214.778%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fff%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22rabby__d%22%20x1%3D%2217.92%22%20x2%3D%229.621%22%20y1%3D%2211.527%22%20y2%3D%223.531%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%238697FF%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238697FF%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22rabby__e%22%20x1%3D%2213.799%22%20x2%3D%225.983%22%20y1%3D%2216.184%22%20y2%3D%2211.865%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%238697FF%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238697FF%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22rabby__f%22%20x1%3D%229.382%22%20x2%3D%2214.821%22%20y1%3D%2211.66%22%20y2%3D%2218.301%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%22.984%22%20stop-color%3D%22%23D1D8FF%22%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%22rabby__a%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h24v24H0z%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E",
      "phantom": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cg%20clip-path%3D%22url(%23phantom__a)%22%3E%3Cpath%20fill%3D%22%23AB9FF2%22%20d%3D%22M24%200H0v24h24z%22%2F%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M5.893%2018.4c2.042%200%203.576-1.706%204.492-3.054a2.5%202.5%200%200%200-.173.883c0%20.787.47%201.348%201.398%201.348%201.275%200%202.636-1.074%203.341-2.23q-.075.25-.074.464c0%20.55.322.895.978.895%202.066%200%204.145-3.52%204.145-6.597C20%207.711%2018.738%205.6%2015.57%205.6%2010.002%205.6%204%2012.137%204%2016.36c0%201.658.928%202.04%201.893%202.04m7.759-8.553c0-.597.347-1.014.854-1.014.495%200%20.841.417.841%201.014%200%20.596-.346%201.026-.841%201.026-.508%200-.854-.43-.854-1.026m2.648%200c0-.597.347-1.014.854-1.014.495%200%20.841.417.841%201.014%200%20.596-.346%201.026-.841%201.026-.507%200-.854-.43-.854-1.026%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3CclipPath%20id%3D%22phantom__a%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h24v24H0z%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E"
  };
  const injected = () => {
    if (typeof window === "undefined" || !window.ethereum) return [];
    return window.ethereum.providers && window.ethereum.providers.length ? window.ethereum.providers : [window.ethereum];
  };
  const WALLETS = [
    { id: "metamask", name: "MetaMask", rdns: ["io.metamask", "io.metamask.flask", "io.metamask.mobile"], icon: ICONS.metamask,
      get: "https://metamask.io/download/",
      // Opens this page inside the MetaMask app's browser (phones without a wallet in the browser)
      app: url => "https://metamask.app.link/dapp/" + url.replace(/^https?:\/\//, ""),
      legacy: () => injected().find(p => p.isMetaMask && !p.isRabby && !p.isPhantom && !p.isBraveWallet && !p.isOkxWallet && !p.isCoinbaseWallet) },
    { id: "rabby", name: "Rabby Wallet", rdns: ["io.rabby"], icon: ICONS.rabby,
      get: "https://rabby.io/",
      legacy: () => injected().find(p => p.isRabby) },
    { id: "phantom", name: "Phantom", rdns: ["app.phantom"], icon: ICONS.phantom,
      get: "https://phantom.com/download",
      app: url => "https://phantom.app/ul/browse/" + encodeURIComponent(url) + "?ref=" + encodeURIComponent(url.replace(/(https?:\/\/[^/]+).*/, "$1")),
      legacy: () => (typeof window !== "undefined" && window.phantom && window.phantom.ethereum) || injected().find(p => p.isPhantom) },
  ];
  const discovered = [];
  if (typeof window !== "undefined") {
    window.addEventListener("eip6963:announceProvider", e => {
      const d = e.detail;
      if (d && d.provider && d.info && !discovered.some(w => w.info.uuid === d.info.uuid)) discovered.push(d);
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }
  // All three wallets, each with its provider when installed (provider: null when not)
  function listWallets() {
    return WALLETS.map(w => {
      const d = discovered.find(x => w.rdns.includes(x.info.rdns));
      return { id: w.id, name: w.name, icon: w.icon, get: w.get, app: w.app || null, provider: d ? d.provider : (w.legacy() || null) };
    });
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
