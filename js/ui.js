/*
 * Menus and flow: practice mode, Chog NFT mode (wallet, ownership, metadata), run eligibility,
 * score submission and the leaderboard view.
 */
(function (root) {
  const cfg = root.ChogConfig, T = root.ChogTraits, Chain = root.ChogChain, Meta = root.ChogMetadata, Art = root.ChogArt;
  const $ = id => document.getElementById(id);
  const dev = new URLSearchParams(location.search).get("dev") || "";
  const PRACTICE_BEST = "chogDashPracticeBest";
  const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  let game;
  const S = {
    mode: null,
    provider: null, account: null, chainId: null,
    chog: null,             // { tokenId, name, metadata, gameplay, imageUrl, riderCanvas }
    auth: null, authError: "",
    runId: null, activeRunId: null, runStatus: { text: "", kind: "" }, sessionReq: 0, runCounter: 0,
    selectReq: 0, metaCache: {},
  };

  // ---------- Helpers ----------
  const short = a => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function show(panelId) {
    ["menuPanel", "nftPanel", "lbPanel"].forEach(id => $(id).classList.toggle("show", id === panelId));
  }
  function setStatus(el, text, kind) { el.textContent = text; el.className = "status" + (kind ? " " + kind : ""); }
  function readNum(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function writeNum(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  function utf8ToHex(s) {
    return "0x" + Array.from(new TextEncoder().encode(s)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // lines: strings, or [text, "warn" | "good"]
  function setMsg(title, lines) {
    const body = lines.filter(Boolean).map(l => {
      const [text, kind] = Array.isArray(l) ? l : [l, ""];
      return '<span class="sub' + (kind ? " " + kind : "") + '">' + esc(text) + "</span>";
    }).join("");
    $("msg").innerHTML = esc(title) + body;
    $("msg").style.display = "block";
  }
  function controlsText(laser) {
    const base = isTouch
      ? "Drag to fly the rocket up, down, left and right."
      : "Move the mouse to fly the rocket. Or use the keyboard: hold Space or W to rise, release to fall, A/D or arrows to steer.";
    return base + (laser ? (isTouch ? " LASER button fires Laser Eyes." : " E fires Laser Eyes.") : "");
  }
  const startText = () => (isTouch ? "Tap to start" : "Press Space or click to start");
  const retryText = () => (isTouch ? "Tap to fly again" : "Press Space or click to fly again");

  async function apiCall(path, body, token) {
    const opts = { method: body ? "POST" : "GET", headers: {} };
    if (body) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    if (token) opts.headers.authorization = "Bearer " + token;
    let res;
    try { res = await fetch(cfg.leaderboard.apiBase + path, opts); }
    catch (e) { const err = new Error("Leaderboard server not reachable"); err.offline = true; throw err; }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || "Leaderboard server error " + res.status);
      err.status = res.status;
      if (res.status === 404 && !data) err.offline = true;
      throw err;
    }
    return data;
  }

  // ---------- Start ----------
  function start() {
    game = root.ChogGame.init({ onReady, onStart, onEnd });
    $("formulaNote").textContent = "NFT runs: " + cfg.scoreFormula +
      ". Tier multipliers are a Chog Dash game-design choice, not an official Chog Genesis rule.";
    $("practiceBtn").onclick = startPractice;
    $("nftBtn").onclick = openNft;
    $("lbBtn").onclick = openLeaderboard;
    $("nftBack").onclick = () => show("menuPanel");
    $("lbBack").onclick = () => show("menuPanel");
    $("hudMenuBtn").onclick = backToMenu;
    $("switchNet").onclick = switchNetwork;
    $("tokenCheck").onclick = () => selectToken($("tokenInput").value.trim());
    $("tokenInput").addEventListener("keydown", e => { if (e.key === "Enter") selectToken($("tokenInput").value.trim()); });
    $("rideBtn").onclick = rideChog;
  }

  function enterGame() {
    show(null);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    game.toReady();
  }

  function backToMenu() {
    S.sessionReq++;
    S.mode = null;
    game.toMenu();
    show("menuPanel");
  }

  // ---------- Practice mode ----------
  function startPractice() {
    S.mode = "practice";
    const laser = dev.includes("laser") ? cfg.abilities.laserEyes.charges : 0;   // dev testing only
    game.configure({
      riderCanvas: Art.rookieCanvas(), laserCharges: laser, multiplier: 1, showScore: false,
      modeLabel: "PRACTICE · Rookie" + (laser ? " · DEV LASER" : ""),
    });
    $("modeBadge").className = "practice";
    enterGame();
  }

  // ---------- Game hooks ----------
  function onReady() {
    $("hudMenuBtn").style.display = "block";
    if (S.mode === "practice") {
      setMsg("PRACTICE MODE", [
        "Rookie, the practice pilot. Not an NFT run, and not eligible for the NFT leaderboard.",
        "Best distance on this device: " + readNum(PRACTICE_BEST) + " m",
        controlsText(game && dev.includes("laser")),
        startText(),
      ]);
    } else if (S.mode === "nft") {
      renderNftReady();
      requestRunSession();
    }
  }

  function onStart() {
    $("hudMenuBtn").style.display = "none";
    $("msg").style.display = "none";
    S.runCounter++;
    S.activeRunId = S.runId;
    S.runId = null;
  }

  function onEnd(result) {
    $("hudMenuBtn").style.display = "block";
    if (S.mode === "practice") {
      const best = Math.max(readNum(PRACTICE_BEST), result.meters);
      writeNum(PRACTICE_BEST, best);
      setMsg("CRASHED", [
        "Distance: " + result.meters + " m",
        "Best on this device: " + best + " m",
        ["Practice run. Not submitted to the NFT leaderboard.", ""],
        retryText(),
      ]);
      return;
    }
    const c = S.chog, g = c.gameplay;
    const key = "chogDashNftBest:" + c.tokenId;
    const best = Math.max(readNum(key), result.score);
    writeNum(key, best);
    const run = S.runCounter;
    const lines = status => [
      "Distance: " + result.meters + " m",
      "Score: " + result.meters + " m x " + g.multiplier.toFixed(2) + " (Tier " + (g.tier || "unknown") + ") = " + result.score,
      "Best score for this Chog on this device: " + best,
      status,
      retryText(),
    ];
    if (!S.activeRunId) {
      setMsg("CRASHED", lines(["Not submitted: " + (S.runStatus.kind === "warn" ? S.runStatus.text : "this run was not registered with the leaderboard"), "warn"]));
      return;
    }
    setMsg("CRASHED", lines(["Submitting to the leaderboard...", ""]));
    apiCall("/run/finish", { runId: S.activeRunId, meters: result.meters, durationMs: result.durationMs, laserUsed: result.laserUsed }, S.auth && S.auth.token)
      .then(r => {
        if (run !== S.runCounter || game.state !== "dead") return;
        const st = r.status === "validated"
          ? ["Validated. Server score " + r.finalScore + " (x" + r.multiplier + ")" + (r.rank ? ", rank " + r.rank : ""), "good"]
          : ["Not validated: " + (r.reason || r.status), "warn"];
        setMsg("CRASHED", lines(st));
      })
      .catch(e => {
        if (run !== S.runCounter || game.state !== "dead") return;
        setMsg("CRASHED", lines(["Not submitted: " + e.message, "warn"]));
      });
  }

  // ---------- NFT mode: run eligibility ----------
  function renderNftReady() {
    const c = S.chog, g = c.gameplay;
    const laser = g.abilities.find(a => a.id === "laserEyes");
    setMsg("CHOG NFT MODE", [
      c.name + " (token " + c.tokenId + ")",
      "Tier " + (g.tier || "unknown") + ": score multiplier x" + g.multiplier.toFixed(2),
      laser ? "Laser Eyes: " + laser.charges + " charges this run" : "No ability from this Chog's traits",
      S.runStatus.text ? [S.runStatus.text, S.runStatus.kind] : "",
      controlsText(!!laser),
      startText(),
    ]);
  }

  async function requestRunSession() {
    S.runId = null;
    const req = ++S.sessionReq;
    if (!S.auth) {
      S.runStatus = { text: "Not eligible for the leaderboard: " + (S.authError || "not signed in"), kind: "warn" };
      renderNftReady();
      return;
    }
    S.runStatus = { text: "Checking leaderboard eligibility...", kind: "" };
    renderNftReady();
    try {
      const r = await apiCall("/run/start", { tokenId: S.chog.tokenId }, S.auth.token);
      if (req !== S.sessionReq) return;
      S.runId = r.runId;
      S.runStatus = { text: "Eligible: this run will be submitted (server-verified Tier " + r.tier + ", x" + r.multiplier + ")", kind: "good" };
    } catch (e) {
      if (req !== S.sessionReq) return;
      if (e.status === 401) S.auth = null;
      S.runStatus = { text: "Not eligible for the leaderboard: " + e.message, kind: "warn" };
    }
    if (game.state === "ready") renderNftReady();
  }

  // ---------- NFT mode: wallet ----------
  function openNft() {
    show("nftPanel");
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(renderWallets, 250);   // give wallets time to announce themselves
  }

  function renderWallets() {
    const box = $("walletButtons");
    box.innerHTML = "";
    const st = $("walletStatus");
    if (S.account) { afterConnect(); }
    if (location.protocol === "file:") {
      setStatus(st, "Wallets can't connect to a page opened as a file. Run Chog Dash from a web server (see README), or use practice mode.", "err");
      return;
    }
    const wallets = Chain.listWallets();
    if (!wallets.length) {
      setStatus(st, "No browser wallet found. Install a wallet that supports Monad, or open this page in your wallet app's browser. You can still play practice mode.", "err");
      return;
    }
    wallets.forEach(w => {
      const b = document.createElement("button");
      b.textContent = S.account ? "Reconnect " + w.name : "Connect " + w.name;
      b.onclick = () => connectWallet(w.provider);
      box.appendChild(b);
    });
    if (!S.account) setStatus(st, "Choose your wallet. You'll be asked to approve the connection.");
  }

  async function connectWallet(provider) {
    const st = $("walletStatus");
    setStatus(st, "Waiting for the wallet...");
    try {
      const r = await Chain.connect(provider);
      if (S.provider !== provider && provider.on) {
        provider.on("accountsChanged", accs => onAccountChange(accs && accs[0]));
        provider.on("chainChanged", id => { S.chainId = Number(id); afterConnect(); });
      }
      S.provider = provider;
      S.account = r.account;
      S.chainId = r.chainId;
      afterConnect();
    } catch (e) {
      setStatus(st, e && e.code === 4001 ? "Connection request was rejected." : "Could not connect: " + (e.message || e), "err");
    }
  }

  function onAccountChange(acc) {
    S.account = acc ? acc.toLowerCase() : null;
    S.chog = null; S.auth = null; S.authError = "";
    if (S.mode === "nft" && game.state !== "menu") {
      game.toMenu();
      S.mode = null;
      show("nftPanel");
    }
    $("chosenCard").style.display = "none";
    if (S.account) afterConnect();
    else { setStatus($("walletStatus"), "Wallet disconnected."); $("holdingsCard").style.display = "none"; }
  }

  function afterConnect() {
    const st = $("walletStatus");
    const right = S.chainId === cfg.collection.chainId;
    $("switchNet").style.display = right ? "none" : "inline-block";
    if (!right) {
      setStatus(st, "Connected " + short(S.account) + ", but the wallet is on chain " + S.chainId +
        ". Chog Genesis is on " + cfg.collection.chainName + " (chain " + cfg.collection.chainId + ").", "err");
      $("holdingsCard").style.display = "none";
      $("chosenCard").style.display = "none";
      return;
    }
    setStatus(st, "Connected " + short(S.account) + " on " + cfg.collection.chainName + ".", "ok");
    loadHoldings();
  }

  async function switchNetwork() {
    try { await Chain.switchToMonad(S.provider); S.chainId = Number(await S.provider.request({ method: "eth_chainId" })); afterConnect(); }
    catch (e) { setStatus($("walletStatus"), "Could not switch network: " + (e.message || e), "err"); }
  }

  // ---------- NFT mode: holdings and selection ----------
  async function loadHoldings() {
    $("holdingsCard").style.display = "block";
    const st = $("holdingsStatus"), grid = $("holdings");
    grid.innerHTML = "";
    $("manualEntry").style.display = "none";
    setStatus(st, "Checking which Chogs this wallet owns...");
    try {
      const r = await Chain.listOwnedTokens(S.provider, S.account, 30);
      if (r.balance === 0n) {
        setStatus(st, "This wallet holds no Chog Genesis NFTs. You can still play practice mode.");
        return;
      }
      if (!r.enumerable) {
        setStatus(st, "This wallet holds " + r.balance + " Chog(s). The contract can't list them automatically, so enter the token ID of the Chog you want to ride. Ownership is checked on-chain.");
        $("manualEntry").style.display = "flex";
        return;
      }
      setStatus(st, "This wallet holds " + r.balance + " Chog(s). Pick one to ride." +
        (Number(r.balance) > r.tokenIds.length ? " Showing the first " + r.tokenIds.length + "; enter a token ID for others." : ""));
      if (Number(r.balance) > r.tokenIds.length) $("manualEntry").style.display = "flex";
      for (const id of r.tokenIds) addTile(grid, id.toString());
    } catch (e) {
      setStatus(st, "Couldn't read the Chog Genesis contract: " + (e.message || e) + "\nYou can enter a token ID instead.", "err");
      $("manualEntry").style.display = "flex";
    }
  }

  function addTile(grid, tokenId) {
    const b = document.createElement("button");
    b.className = "tok";
    b.innerHTML = '<img alt=""><div>Token ' + esc(tokenId) + "</div>";
    b.onclick = () => selectToken(tokenId);
    grid.appendChild(b);
    getMetadata(tokenId).then(m => {
      if (m.name) b.querySelector("div").textContent = m.name + " (token " + tokenId + ")";
      const urls = Meta.candidateUrls(m.image);
      const img = b.querySelector("img");
      let i = 0;
      img.onerror = () => { if (i < urls.length) img.src = urls[i++]; };
      img.onerror();
    }).catch(() => {});
  }

  async function getMetadata(tokenId) {
    if (S.metaCache[tokenId]) return S.metaCache[tokenId];
    const uri = await Chain.reads.tokenURI(S.provider, BigInt(tokenId));
    const { json } = await Meta.fetchJson(uri);
    S.metaCache[tokenId] = json;
    return json;
  }

  async function selectToken(idStr) {
    const info = $("chosenInfo");
    $("chosenCard").style.display = "block";
    $("rideBtn").disabled = true;
    setStatus($("rideStatus"), "");
    $("traitRows").innerHTML = "";
    $("chosenImg").removeAttribute("src");
    $("chosenName").textContent = "Token " + idStr;
    document.querySelectorAll(".tok").forEach(t => t.classList.toggle("sel", t.textContent.includes("token " + idStr + ")") || t.textContent === "Token " + idStr));
    if (!/^\d+$/.test(idStr)) { setStatus(info, "Enter a whole-number token ID.", "err"); return; }
    const req = ++S.selectReq;
    const stale = () => req !== S.selectReq;
    S.chog = null;

    setStatus(info, "Checking ownership on-chain...");
    const own = await Chain.verifyOwnership(S.provider, BigInt(idStr), S.account);
    if (stale()) return;
    if (!own.owned) { setStatus(info, own.reason, "err"); return; }

    setStatus(info, "Loading this Chog's metadata...");
    let meta;
    try { meta = await getMetadata(idStr); }
    catch (e) { if (!stale()) setStatus(info, "Couldn't load this Chog's metadata, so it can't be used right now. Try again in a moment.\n" + e.message, "err"); return; }
    if (stale()) return;

    const gp = T.resolveGameplay(meta);
    const name = typeof meta.name === "string" && meta.name.trim() ? meta.name : "Token " + idStr;
    $("chosenName").textContent = name;
    $("traitRows").innerHTML = gp.attributes.map(a => "<tr><td>" + esc(a.trait_type) + "</td><td>" + esc(a.value) + "</td></tr>").join("");
    const laser = gp.abilities.find(a => a.id === "laserEyes");
    const lines = [
      "Token ID " + idStr + ": owned by this wallet (checked on-chain).",
      "Tier: " + (gp.tier || "missing") + " -> score multiplier x" + gp.multiplier.toFixed(2) + (gp.tierStatus === "mapped" ? "" : " (default)"),
      laser ? "Ability: Laser Eyes, " + laser.charges + " charges per run (from " + laser.fromTrait + ": " + laser.fromValue + ")"
        : "Ability: none. This Chog's Eyes trait has no ability mapped.",
    ].concat(gp.problems.map(p => "Metadata problem: " + p), gp.notes.map(n => "Note: " + n));
    setStatus(info, lines.join("\n") + "\nLoading artwork...");

    let art;
    try {
      art = await Meta.loadImage(meta.image);
      const canvas = Art.nftRiderCanvas(art.img);
      canvas.getContext("2d").getImageData(0, 0, 1, 1);   // throws if the image can't be used by the game
      if (stale()) return;
      $("chosenImg").src = art.url;
      S.chog = { tokenId: idStr, name, metadata: meta, gameplay: gp, imageUrl: art.url, riderCanvas: canvas };
      setStatus(info, lines.join("\n"));
      $("rideBtn").disabled = false;
    } catch (e) {
      if (!stale()) setStatus(info, lines.join("\n") + "\nCouldn't load this Chog's artwork, so it can't be ridden right now. Try again in a moment.", "err");
    }
  }

  async function rideChog() {
    const c = S.chog;
    if (!c) return;
    const rs = $("rideStatus");
    $("rideBtn").disabled = true;
    setStatus(rs, "Re-checking ownership...");
    const own = await Chain.verifyOwnership(S.provider, BigInt(c.tokenId), S.account);
    if (!own.owned) { setStatus(rs, own.reason, "err"); $("rideBtn").disabled = false; return; }

    if (!S.auth || S.auth.account !== S.account || S.auth.expiresAt < Date.now()) {
      setStatus(rs, "Sign the message in your wallet to enter the leaderboard. This is free and sends no transaction.");
      try { await signIn(); S.authError = ""; }
      catch (e) {
        S.auth = null;
        S.authError = e && e.code === 4001 ? "you declined to sign in" : (e.message || String(e));
      }
    }
    setStatus(rs, "");
    $("rideBtn").disabled = false;

    const laser = c.gameplay.abilities.find(a => a.id === "laserEyes");
    S.mode = "nft";
    game.configure({
      riderCanvas: c.riderCanvas, laserCharges: laser ? laser.charges : 0,
      multiplier: c.gameplay.multiplier, showScore: true,
      modeLabel: "CHOG NFT · " + c.name + " · Tier " + (c.gameplay.tier || "unknown"),
    });
    $("modeBadge").className = "nft";
    enterGame();
  }

  async function signIn() {
    const n = await apiCall("/auth/nonce", { wallet: S.account });
    const signature = await S.provider.request({ method: "personal_sign", params: [utf8ToHex(n.message), S.account] });
    const v = await apiCall("/auth/verify", { wallet: S.account, message: n.message, signature });
    S.auth = { token: v.token, account: S.account, expiresAt: v.expiresAt };
  }

  // ---------- Leaderboard view ----------
  async function openLeaderboard() {
    show("lbPanel");
    $("lbRule").textContent = "Ranking: each Chog's best validated score. " + cfg.scoreFormula +
      ". Only validated Chog NFT runs appear here; practice runs never do.";
    const st = $("lbStatus"), rows = $("lbRows");
    rows.innerHTML = "";
    setStatus(st, "Loading...");
    try {
      const r = await apiCall("/leaderboard");
      if (!r.entries.length) setStatus(st, "No validated runs yet.");
      else setStatus(st, "");
      rows.innerHTML = r.entries.map(e => "<tr><td>" + e.rank + "</td><td>" + esc(e.name || "Token " + e.tokenId) +
        " (token " + esc(e.tokenId) + ")</td><td>" + esc(short(e.wallet)) + "</td><td>" + e.meters + " m</td><td>x" +
        Number(e.multiplier).toFixed(2) + " (" + esc(e.tier || "unknown") + ")</td><td>" + e.score + "</td></tr>").join("");
    } catch (e) {
      setStatus(st, e.offline ? "The leaderboard server isn't reachable from here. It runs on the deployed site (see README)." : e.message, "err");
    }
  }

  root.ChogUI = { start, _state: S, _game: () => game };
})(window);
