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
    chog: null,             // { tokenId, name, metadata, gameplay, imageUrl, riderCanvas, riderPoses }
    auth: null, authError: "",
    runId: null, activeRunId: null, runStatus: { text: "", kind: "" }, sessionReq: 0, runCounter: 0,
    selectReq: 0, holdingsReq: 0, signReq: 0, metaCache: {},
    username: null,
    lastRun: null,          // the finished run, for the run card
  };

  // ---------- Helpers ----------
  const short = a => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function show(panelId) {
    ["menuPanel", "nftPanel", "lbPanel", "howPanel"].forEach(id => $(id).classList.toggle("show", id === panelId));
    if (panelId === "menuPanel") refreshHome();
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
      : "Move the mouse to fly the rocket. Or use the keyboard: W/A/S/D or the arrow keys. The rocket stays put when you let go. F for full screen.";
    return base + (laser ? (isTouch ? " LASER button fires Laser Eyes." : " E fires Laser Eyes.") : "");
  }
  const startText = () => (isTouch ? "Tap to start" : "Press Space or click to start");
  const portraitTip = () => (window.innerHeight > window.innerWidth ? "Tip: turn your phone sideways for a bigger view." : "");
  const retryText = () => (isTouch ? "Tap to fly again" : "Press Space or click to fly again");

  async function apiCall(path, body, token) {
    const opts = { method: body ? "POST" : "GET", headers: {} };
    if (body) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    if (token) opts.headers.authorization = "Bearer " + token;
    let res;
    if (location.protocol === "file:") {   // no server when the page is opened as a file
      const err = new Error("Leaderboard server not reachable"); err.offline = true; throw err;
    }
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
    $("formulaNote").innerHTML = "<b>Total distance:</b> " + esc(cfg.scoreFormula) +
      ". Tier multipliers are a Chog Dash game-design choice, not an official Chog Genesis rule.";
    $("modePractice").onclick = () => setHomeMode("practice");
    $("modeNft").onclick = () => setHomeMode("nft");
    $("playBtn").onclick = play;
    $("walletChip").onclick = openNft;
    $("lbBtn").onclick = openLeaderboard;
    $("howBtn").onclick = () => show("howPanel");
    $("nftBack").onclick = () => show("menuPanel");
    $("lbBack").onclick = () => show("menuPanel");
    $("howBack").onclick = () => show("menuPanel");
    setupFullscreen();
    placeHero();
    window.addEventListener("resize", () => setTimeout(placeHero, 50));
    // Space or Enter on the home screen plays
    window.addEventListener("keydown", e => {
      if (!$("menuPanel").classList.contains("show") || e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); play(); }
    });
    let saved = "practice";
    try { saved = localStorage.getItem("chogDashMode") || "practice"; } catch (e) {}
    setHomeMode(saved === "nft" ? "nft" : "practice");
    $("hudMenuBtn").onclick = backToMenu;
    $("switchNet").onclick = switchNetwork;
    $("signInBtn").onclick = signInAndScan;
    $("holdingsRetry").onclick = loadHoldings;
    $("pilotSave").onclick = savePilot;
    $("pilotInput").addEventListener("keydown", e => { if (e.key === "Enter") savePilot(); });
    $("rideBtn").onclick = rideChog;
    $("cardBtn").onclick = openCard;
    $("cardClose").onclick = closeCard;
    $("cardSave").onclick = saveCard;
    $("cardShare").onclick = shareCard;
    window.addEventListener("keydown", e => { if (e.key === "Escape" && $("cardPanel").classList.contains("show")) closeCard(); });
  }

  // ---------- Full screen (button, HUD button, F key) ----------
  function setupFullscreen() {
    const el = document.documentElement;
    const supported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const toggle = () => {
      try {
        const r = isFull()
          ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
          : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (r && r.catch) r.catch(() => {});
      } catch (e) {}
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    };
    const sync = () => {
      document.body.classList.toggle("is-fullscreen", isFull());
      const label = isFull() ? "Exit full screen" : "Full screen";
      document.querySelectorAll(".fs-label").forEach(l => { l.textContent = label; });
      document.querySelectorAll(".fs-btn").forEach(b => { b.title = label + " (F)"; });
    };
    ["fsBtn", "hudFsBtn"].forEach(id => {
      $(id).classList.toggle("unsupported", !supported);
      $(id).onclick = toggle;
    });
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    window.addEventListener("keydown", e => {
      if (!supported || e.repeat || e.code !== "KeyF" || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      toggle();
    });
    sync();
  }

  // ---------- Home screen ----------
  let homeMode = "practice";
  function setHomeMode(m) {
    homeMode = m;
    try { localStorage.setItem("chogDashMode", m); } catch (e) {}
    $("modePractice").classList.toggle("on", m === "practice");
    $("modeNft").classList.toggle("on", m === "nft");
    refreshHome();
  }
  function refreshHome() {
    const nft = homeMode === "nft";
    $("modeHint").textContent = nft
      ? (S.chog ? "Ride " + S.chog.name + ". Abilities from its traits. Ranked." : "Ride a Chog you own. Abilities from its traits. Ranked.")
      : "Fly as Rookie, the practice pilot. No wallet. Not ranked.";
    $("playBtn").textContent = nft && !S.chog ? "PICK CHOG" : "PLAY";
    $("playBtn").style.fontSize = nft && !S.chog ? "30px" : "";
    $("bestLabel").textContent = nft && S.chog ? "BEST TOTAL" : "BEST";
    $("bestValue").textContent = (nft && S.chog ? readNum("chogDashNftBest:" + S.chog.tokenId) : readNum(PRACTICE_BEST)).toLocaleString() + " m";
    $("walletChipText").textContent = S.account ? (S.username || short(S.account)) : "Connect wallet";
    $("walletDot").classList.toggle("on", !!S.account && S.chainId === cfg.collection.chainId);
    $("keyHint").textContent = "Press SPACE to " + (nft && !S.chog ? "pick a Chog" : "play") + "  ·  F for full screen";
    placeHero();
  }
  // On tall screens, place the home screen rocket in the gap between PLAY and the bottom buttons
  function placeHero() {
    if (!game || innerWidth >= innerHeight) { game && game.setHeroScreenY(null); return; }
    const top = $("playBtn").getBoundingClientRect().bottom, bottom = document.querySelector(".home-bottom").getBoundingClientRect().top;
    game.setHeroScreenY(bottom > top ? ((top + bottom) / 2) / innerHeight : null);
  }

  function play() {
    if (homeMode === "practice") startPractice();
    else if (S.chog) rideChog();
    else openNft();
  }

  function enterGame() {
    show(null);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    game.toReady();
  }

  function backToMenu() {
    $("cardBtn").style.display = "none";
    closeCard();
    S.sessionReq++;
    S.mode = null;
    setFlying(false);
    game.toMenu();
    show("menuPanel");
  }

  // ---------- Practice mode ----------
  function startPractice() {
    S.mode = "practice";
    const laser = dev.includes("laser") ? cfg.abilities.laserEyes.charges : 0;   // dev testing only
    game.configure({
      riderCanvas: Art.rookieCanvas(), riderPoses: { side: Art.rookieThreeQuarterCanvas(), back: Art.rookieBackCanvas() },
      look: null, laserCharges: laser, multiplier: 1, showScore: false,
      modeLabel: "PRACTICE · Rookie" + (laser ? " · DEV LASER" : ""),
    });
    $("modeBadge").className = "practice";
    $("riderCard").style.display = "none";
    enterGame();
  }

  // ---------- Game hooks ----------
  function setFlying(on) {
    document.body.classList.toggle("flying", on);
    $("hudMenuBtn").style.display = on ? "none" : "block";
    $("hudFsBtn").style.display = on ? "none" : "";
  }

  function onReady() {
    $("cardBtn").style.display = "none";
    closeCard();
    setFlying(false);
    if (S.mode === "practice") {
      setMsg("PRACTICE MODE", [
        "Rookie, the practice pilot. Not an NFT run, and not eligible for the NFT leaderboard.",
        "Best distance on this device: " + readNum(PRACTICE_BEST) + " m",
        controlsText(game && dev.includes("laser")),
        portraitTip(),
        startText(),
      ]);
    } else if (S.mode === "nft") {
      renderNftReady();
      requestRunSession();
    }
  }

  function onStart() {
    setFlying(true);
    $("cardBtn").style.display = "none";
    S.lastRun = null;
    $("msg").style.display = "none";
    S.runCounter++;
    S.activeRunId = S.runId;
    S.runId = null;
  }

  function onEnd(result) {
    setFlying(false);
    rememberRun(result);
    if (S.mode === "practice") {
      const best = Math.max(readNum(PRACTICE_BEST), result.meters);
      writeNum(PRACTICE_BEST, best);
      setMsg("CRASHED", [
        "Distance: " + result.meters + " m",
        "Best on this device: " + best + " m",
        "Stardust collected: " + (result.stardust || 0),
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
      "Total distance: " + result.meters + " m x " + g.multiplier.toFixed(2) + " (Tier " + (g.tier || "unknown") + ") = " + result.score + " m",
      "Best total distance for this Chog on this device: " + best + " m",
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
        if (r.status === "validated" && S.lastRun) { S.lastRun.rank = r.rank || null; S.lastRun.total = r.finalScore; }
        const st = r.status === "validated"
          ? ["Validated. Total distance " + r.finalScore + " m (x" + r.multiplier + ")" + (r.rank ? ", rank " + r.rank : ""), "good"]
          : ["Not validated: " + (r.reason || r.status), "warn"];
        setMsg("CRASHED", lines(st));
      })
      .catch(e => {
        if (run !== S.runCounter || game.state !== "dead") return;
        setMsg("CRASHED", lines(["Not submitted: " + e.message, "warn"]));
      });
  }

  // ---------- Run card ----------
  function rememberRun(result) {
    const nft = S.mode === "nft" && S.chog;
    const z = T.zoneAt(result.meters);
    S.lastRun = {
      practice: !nft,
      portrait: nft ? S.chog.img : Art.rookieCanvas(),
      username: S.username || (nft ? short(S.account) : "Practice pilot"),
      chogName: nft ? S.chog.name : null,
      tier: nft ? S.chog.gameplay.tier : null,
      multiplier: nft ? S.chog.gameplay.multiplier : 1,
      meters: result.meters, total: result.score,
      zoneName: z.zone.name + (z.loop > 1 ? " (loop " + z.loop + ")" : ""),
      lookName: nft && S.chog.look ? S.chog.look.name : null,
      rank: null,
    };
    $("cardBtn").style.display = result.meters > 0 ? "block" : "none";
  }

  let cardCanvas = null;
  async function openCard() {
    if (!S.lastRun) return;
    await root.ChogCard.ready();
    cardCanvas = root.ChogCard.render(S.lastRun);
    $("cardImg").src = cardCanvas.toDataURL("image/png");
    const canShareFiles = !!(navigator.canShare && navigator.share);
    $("cardShare").style.display = canShareFiles ? "" : "none";
    setStatus($("cardStatus"), "");
    $("cardPanel").classList.add("show");
  }
  function closeCard() { $("cardPanel").classList.remove("show"); }

  const cardName = () => "chog-dash-" + (S.lastRun.practice ? "practice" : "run") + "-" + (S.lastRun.practice ? S.lastRun.meters : S.lastRun.total) + "m.png";
  const cardText = () => S.lastRun.practice
    ? "I flew " + S.lastRun.meters.toLocaleString() + " m in Chog Dash practice. Can you fly further?"
    : "I flew " + S.lastRun.total.toLocaleString() + " m total in Chog Dash with " + S.lastRun.chogName + (S.lastRun.rank ? ", rank #" + S.lastRun.rank : "") + ". Can you fly further?";
  function cardBlob() { return new Promise(res => cardCanvas.toBlob(res, "image/png")); }

  async function saveCard() {
    if (!cardCanvas) return;
    const url = URL.createObjectURL(await cardBlob());
    const a = document.createElement("a");
    a.href = url; a.download = cardName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus($("cardStatus"), "Saved " + cardName(), "ok");
  }
  async function shareCard() {
    if (!cardCanvas) return;
    const file = new File([await cardBlob()], cardName(), { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: cardText() });
      else await navigator.share({ text: cardText() });
    } catch (e) {
      if (e && e.name !== "AbortError") setStatus($("cardStatus"), "Couldn't open sharing here. Use Save image instead.", "err");
    }
  }

  // ---------- NFT mode: run eligibility ----------
  function renderNftReady() {
    const c = S.chog, g = c.gameplay;
    const laser = g.abilities.find(a => a.id === "laserEyes");
    setMsg("CHOG NFT MODE", [
      c.name + " (token " + c.tokenId + ")",
      "Tier " + (g.tier || "unknown") + ": distance multiplier x" + g.multiplier.toFixed(2),
      laser ? "Laser Eyes: " + laser.charges + " charges this run" : "No ability from this Chog's traits",
      lookLines(c.look)[0],
      S.runStatus.text ? [S.runStatus.text, S.runStatus.kind] : "",
      controlsText(!!laser),
      portraitTip(),
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
    S.chog = null; S.auth = null; S.authError = ""; S.username = null;
    if (S.mode === "nft" && game.state !== "menu") {
      game.toMenu();
      S.mode = null;
      show("nftPanel");
    }
    $("chosenCard").style.display = "none";
    if (S.account) afterConnect();
    else {
      setStatus($("walletStatus"), "Wallet disconnected.");
      ["holdingsCard", "pilotCard", "signInBtn"].forEach(id => { $(id).style.display = "none"; });
    }
  }

  function afterConnect() {
    refreshHome();
    const st = $("walletStatus");
    const right = S.chainId === cfg.collection.chainId;
    $("switchNet").style.display = right ? "none" : "inline-block";
    if (!right) {
      setStatus(st, "Connected " + short(S.account) + ", but the wallet is on chain " + S.chainId +
        ". Chog Genesis is on " + cfg.collection.chainName + " (chain " + cfg.collection.chainId + ").", "err");
      ["holdingsCard", "chosenCard", "pilotCard", "signInBtn"].forEach(id => { $(id).style.display = "none"; });
      return;
    }
    if (authValid()) { renderSignedIn(); return; }
    signInAndScan();
  }

  const authValid = () => !!S.auth && S.auth.account === S.account && S.auth.expiresAt > Date.now();

  // ---------- NFT mode: sign in, then find the wallet's Chogs ----------
  // Signing proves control of the wallet (free, no transaction). The server then trusts this
  // wallet for ownership checks; the Chogs themselves are found by scanning the contract.
  async function signInAndScan() {
    const st = $("walletStatus");
    const req = ++S.signReq;
    $("signInBtn").style.display = "none";
    $("holdingsCard").style.display = "none";
    setStatus(st, "Connected " + short(S.account) + ". Sign the message in your wallet to check your Chogs. It's free and sends no transaction.");
    try {
      await signIn();
      if (req !== S.signReq) return;
      S.authError = "";
      renderSignedIn();
    } catch (e) {
      if (req !== S.signReq) return;
      S.auth = null;
      if (e && e.offline) {
        // No leaderboard server (local file or offline): still show the Chogs, runs just aren't ranked
        S.authError = "the leaderboard server isn't reachable";
        setStatus(st, "Connected " + short(S.account) + ". The leaderboard server isn't reachable, so runs won't be ranked. Your Chogs are still checked on-chain.", "err");
        loadHoldings();
        return;
      }
      S.authError = e && e.code === 4001 ? "you declined to sign in" : (e.message || String(e));
      setStatus(st, (e && e.code === 4001 ? "Sign-in was declined." : "Sign-in failed: " + S.authError) +
        " Sign in to check your Chogs.", "err");
      $("signInBtn").style.display = "inline-block";
    }
  }

  function renderSignedIn() {
    setStatus($("walletStatus"), "Signed in as " + (S.username || short(S.account)) + " on " + cfg.collection.chainName + ".", "ok");
    $("signInBtn").style.display = "none";
    $("pilotCard").style.display = "block";
    $("pilotInput").value = S.username || "";
    setStatus($("pilotStatus"), S.username ? "" : "Choose a pilot name to enter the leaderboard.", S.username ? "" : "warn");
    refreshHome();
    loadHoldings();
  }

  async function savePilot() {
    const ps = $("pilotStatus"), name = $("pilotInput").value.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{2,15}$/.test(name)) {
      setStatus(ps, "Use 3 to 16 letters, numbers or underscores, starting with a letter.", "err");
      return;
    }
    if (!authValid()) { setStatus(ps, "Sign in first.", "err"); return; }
    $("pilotSave").disabled = true;
    setStatus(ps, "Saving...");
    try {
      const r = await apiCall("/profile", { username: name }, S.auth.token);
      S.username = r.username;
      setStatus(ps, "Saved. You'll show up as " + r.username + ".", "ok");
      setStatus($("walletStatus"), "Signed in as " + r.username + " on " + cfg.collection.chainName + ".", "ok");
      setStatus($("rideStatus"), "");
      refreshHome();
    } catch (e) {
      if (e.status === 401) S.auth = null;
      setStatus(ps, e.message, "err");
    }
    $("pilotSave").disabled = false;
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
    $("holdingsRetry").style.display = "none";
    setStatus(st, "Checking the Chog Genesis contract for your Chogs...");
    // Only the latest load may update the list (a network switch can trigger two loads at once)
    const req = ++S.holdingsReq;
    try {
      const r = await Chain.findOwnedTokens(S.provider, S.account, {
        onProgress: (done, total) => { if (req === S.holdingsReq) setStatus(st, "Checking the Chog Genesis contract for your Chogs... " + done + " / " + total); },
      });
      if (req !== S.holdingsReq) return;
      if (r.balance === 0) {
        setStatus(st, "This wallet holds no Chog Genesis NFTs. You can still play practice mode.");
        return;
      }
      setStatus(st, "Found " + r.tokenIds.length + " Chog" + (r.tokenIds.length === 1 ? "" : "s") + " in this wallet. Pick one to ride." +
        (r.complete ? "" : "\nThe contract says this wallet holds " + r.balance + ", but only " + r.tokenIds.length + " could be found."), r.complete ? "" : "warn");
      if (!r.complete) $("holdingsRetry").style.display = "inline-block";
      for (const id of r.tokenIds) addTile(grid, id);
      if (r.tokenIds.length === 1) selectToken(r.tokenIds[0]);
    } catch (e) {
      if (req !== S.holdingsReq) return;
      setStatus(st, "Couldn't read the Chog Genesis contract: " + (e.message || e), "err");
      $("holdingsRetry").style.display = "inline-block";
    }
  }

  function addTile(grid, tokenId) {
    const b = document.createElement("button");
    b.className = "tok";
    b.dataset.token = tokenId;
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
    document.querySelectorAll(".tok").forEach(t => t.classList.toggle("sel", t.dataset.token === idStr));
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
      "Owned by this wallet (checked on-chain).",
      "Tier: " + (gp.tier || "missing") + " -> distance multiplier x" + gp.multiplier.toFixed(2) + (gp.tierStatus === "mapped" ? "" : " (default)"),
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
      // In flight the rider faces where the rocket goes, so the camera sees a back view made from this
      // Chog's own traits and colours (see Art.chogBackCanvas). The portrait is shown in the HUD.
      const riderPoses = {
        side: Art.chogBackCanvas(art.img, gp.attributes, "threeQuarter", meta),
        back: Art.chogBackCanvas(art.img, gp.attributes, "back", meta),
      };
      // Rocket paint, glow and aura trail from the traits (looks only, see js/looks.js)
      const look = root.ChogLooks.rocketLook(gp.attributes, meta, Art.samplePalette(art.img).bg);
      S.chog = { tokenId: idStr, name, metadata: meta, gameplay: gp, imageUrl: art.url, img: art.img, riderCanvas: canvas, riderPoses, look };
      setStatus(info, lines.concat(lookLines(look)).join("\n"));
      $("rideBtn").disabled = false;
    } catch (e) {
      if (!stale()) setStatus(info, lines.join("\n") + "\nCouldn't load this Chog's artwork, so it can't be ridden right now. Try again in a moment.", "err");
    }
  }

  function lookLines(look) {
    return ["Rocket: " + look.name + (look.trail ? ". Aura trail: " + look.trail.name : ". No aura trail")];
  }

  async function rideChog() {
    const c = S.chog;
    if (!c) return;
    const rs = $("rideStatus");
    $("rideBtn").disabled = true;
    setStatus(rs, "Re-checking ownership...");
    const own = await Chain.verifyOwnership(S.provider, BigInt(c.tokenId), S.account);
    if (!own.owned) { setStatus(rs, own.reason, "err"); $("rideBtn").disabled = false; return; }

    if (!authValid() && S.authError !== "the leaderboard server isn't reachable") {
      setStatus(rs, "Your sign-in expired. Sign the message in your wallet again. It's free and sends no transaction.");
      try { await signIn(); S.authError = ""; }
      catch (e) {
        S.auth = null;
        S.authError = e && e.code === 4001 ? "you declined to sign in" : (e.message || String(e));
      }
    }
    if (authValid() && !S.username) {
      setStatus(rs, "Choose a pilot name above first. It's how you appear on the leaderboard.", "err");
      $("pilotCard").style.display = "block";
      $("pilotInput").focus();
      $("rideBtn").disabled = false;
      return;
    }
    setStatus(rs, "");
    $("rideBtn").disabled = false;

    const laser = c.gameplay.abilities.find(a => a.id === "laserEyes");
    S.mode = "nft";
    game.configure({
      riderCanvas: c.riderCanvas, riderPoses: c.riderPoses, look: c.look, laserCharges: laser ? laser.charges : 0,
      multiplier: c.gameplay.multiplier, showScore: true,
      modeLabel: "CHOG NFT · " + c.name + " · Tier " + (c.gameplay.tier || "unknown"),
    });
    $("modeBadge").className = "nft";
    $("riderCard").src = c.imageUrl;
    $("riderCard").style.display = "block";
    enterGame();
  }

  async function signIn() {
    const n = await apiCall("/auth/nonce", { wallet: S.account });
    const signature = await S.provider.request({ method: "personal_sign", params: [utf8ToHex(n.message), S.account] });
    const v = await apiCall("/auth/verify", { wallet: S.account, message: n.message, signature });
    S.auth = { token: v.token, account: S.account, expiresAt: v.expiresAt };
    S.username = v.username || null;
  }

  // ---------- Leaderboard view ----------
  // Game-style board: podium for the top 3, rows with each player's Chog, and the player's own
  // standing pinned at the bottom.
  const fmtM = n => Number(n).toLocaleString() + "<small>m</small>";

  // Chog artwork through the IPFS gateways, falling back to the next one on error
  function chogImg(uri, cls) {
    const img = document.createElement("img");
    img.className = cls; img.alt = "";
    const urls = uri ? Meta.candidateUrls(uri) : [];
    let i = 0;
    img.onerror = () => { if (i < urls.length) img.src = urls[i++]; else img.style.visibility = "hidden"; };
    img.onerror();
    return img;
  }
  function entryNames(e) {
    return '<div class="who">' + esc(e.username || short(e.wallet)) + '</div><div class="chog">' +
      esc((e.name || "Token " + e.tokenId) + (e.tier ? " · " + e.tier + " x" + Number(e.multiplier).toFixed(2) : "")) + "</div>";
  }

  function renderBoard(r) {
    const podium = $("lbPodium"), list = $("lbList"), mine = S.auth && S.auth.account;
    podium.innerHTML = ""; list.innerHTML = "";
    if (!r.entries.length) {
      list.innerHTML = '<div class="lb-empty"><div class="t">No pilots yet</div><p>Fly a Chog you own and take the top spot.</p></div>';
      const b = document.createElement("button");
      b.textContent = "Fly a Chog"; b.onclick = () => { setHomeMode("nft"); openNft(); };
      list.firstChild.appendChild(b);
      return;
    }
    // Podium in 2, 1, 3 order so first place stands in the middle
    [1, 0, 2].forEach(i => {
      const e = r.entries[i];
      if (!e) return;
      const d = document.createElement("div");
      d.className = "pod lb-entry r" + e.rank + (mine && e.wallet === mine ? " mine" : "");
      d.innerHTML = '<div class="medal">' + e.rank + "</div>";
      d.appendChild(chogImg(e.image, "face"));
      d.insertAdjacentHTML("beforeend", entryNames(e) + '<div class="big">' + fmtM(e.totalMeters) + "</div>");
      podium.appendChild(d);
    });
    r.entries.slice(3).forEach(e => {
      const d = document.createElement("div");
      d.className = "lb-row lb-entry" + (mine && e.wallet === mine ? " mine" : "");
      d.innerHTML = '<div class="rk">' + e.rank + "</div>";
      d.appendChild(chogImg(e.image, "face"));
      d.insertAdjacentHTML("beforeend", '<div class="names">' + entryNames(e) + '</div><div class="big">' + fmtM(e.totalMeters) + "</div>");
      list.appendChild(d);
    });
  }

  function renderMe(me) {
    const box = $("lbMe");
    box.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "bar";
    box.appendChild(bar);
    if (me && me.rank) {
      bar.innerHTML = '<span class="you">YOU</span><div class="rk">#' + me.rank + "</div>";
      bar.appendChild(chogImg(me.image, "face"));
      bar.insertAdjacentHTML("beforeend", '<div class="names">' + entryNames(me) + '</div><div class="big">' + fmtM(me.totalMeters) + "</div>");
      return;
    }
    const signedIn = me || authValid();
    bar.innerHTML = '<span class="you">YOU</span><div class="names"><div class="who">' +
      esc(signedIn ? (S.username || short(S.account)) : "Not signed in") + '</div><div class="hint">' +
      (signedIn ? "Not ranked yet. Finish a Chog NFT run to get on the board." : "Connect a wallet in Chog NFT mode to see your rank.") + "</div></div>";
    const b = document.createElement("button");
    b.textContent = signedIn ? "Fly" : "Connect";
    b.onclick = () => { setHomeMode("nft"); signedIn && S.chog ? (show("menuPanel"), play()) : openNft(); };
    bar.appendChild(b);
  }

  async function openLeaderboard() {
    show("lbPanel");
    $("lbRule").textContent = "Total distance = distance flown x the Chog's tier multiplier. Each player's best run with any Chog they own counts. Only validated Chog NFT runs appear here; practice runs never do.";
    $("lbRefresh").onclick = openLeaderboard;
    const st = $("lbStatus");
    $("lbPodium").innerHTML = "";
    $("lbList").innerHTML = '<div class="lb-row skeleton"></div>'.repeat(4);
    st.textContent = ""; st.className = "lb-status";
    renderMe(null);
    try {
      const r = await apiCall("/leaderboard", null, authValid() ? S.auth.token : null);
      renderBoard(r);
      renderMe(r.me);
    } catch (e) {
      $("lbList").innerHTML = "";
      st.className = "lb-status err";
      st.textContent = e.offline ? "The leaderboard server isn't reachable from here. It runs on the deployed site (see README)." : e.message;
    }
  }

  root.ChogUI = { start, _state: S, _game: () => game };
})(window);
