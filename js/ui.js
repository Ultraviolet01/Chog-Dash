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
    ["menuPanel", "nftPanel", "lbPanel", "howPanel", "questPanel"].forEach(id => $(id).classList.toggle("show", id === panelId));
    if (panelId !== "questPanel") clearInterval(questTimer);
    if (panelId === "menuPanel") { refreshHome(); $("questStrip").classList.remove("show"); stopReveal(); }
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
    return base + (laser ? (isTouch ? " Tap with a second finger to fire Laser Eyes." : " Press E to fire Laser Eyes.") : "");
  }
  const startText = () => (isTouch ? "Tap to start" : "Press Space or click to start");
  const portraitTip = () => (window.innerHeight > window.innerWidth ? "Tip: turn your phone sideways for a bigger view." : "");
  const retryText = () => "";   // the PLAY AGAIN button and its hint replace the old text line

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
    game = root.ChogGame.init({ onReady, onStart, onEnd, onRetry: playAgain });
    $("modePractice").onclick = () => setHomeMode("practice");
    $("modeNft").onclick = () => setHomeMode("nft");
    $("playBtn").onclick = play;
    $("walletChip").onclick = openNft;
    $("lbBtn").onclick = openLeaderboard;
    $("howBtn").onclick = openHow;
    $("nftBack").onclick = () => show("menuPanel");
    $("lbBack").onclick = () => show("menuPanel");
    $("howBack").onclick = () => show("menuPanel");
    $("questBtn").onclick = openQuests;
    $("questBack").onclick = () => show("menuPanel");
    $("questRefresh").onclick = openQuests;
    setupFullscreen();
    setupSound();
    placeHero();
    window.addEventListener("resize", () => setTimeout(() => { placeHero(); movePill(true); }, 50));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(true));
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
    $("againBtn").onclick = playAgain;
    $("endHomeBtn").onclick = backToMenu;
    $("endLbBtn").onclick = () => { backToMenu(); openLeaderboard(); };
    window.addEventListener("keydown", e => {
      if (e.code === "KeyR" && !e.repeat && game.state === "dead" && !document.querySelector(".panel.show") && e.target.tagName !== "INPUT") playAgain();
    });
    $("cardClose").onclick = closeCard;
    $("cardSave").onclick = saveCard;
    $("cardShare").onclick = shareCard;
    $("cardX").onclick = shareToX;
    $("cardFmtWide").onclick = () => setCardFormat("wide");
    $("cardFmtSquare").onclick = () => setCardFormat("square");
    window.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if ($("cardPanel").classList.contains("show")) closeCard();
      else if (game.state === "dead" && !document.querySelector(".panel.show")) backToMenu();
    });
  }

  // ---------- How to play: five swipeable pages ----------
  let howPage = 0, howBuilt = false;
  const HOW_PAGES = 6;
  function openHow() {
    if (!howBuilt) { buildHow(); howBuilt = true; }
    // Page 5 shows your own Chog once you've picked one
    const face = document.querySelector("#howModes .md-chog");
    if (face) face.innerHTML = S.chog && S.chog.imageUrl ? '<img alt="" src="' + esc(S.chog.imageUrl) + '">' : "CHOG";
    goHow(0, true);
    show("howPanel");
  }
  function goHow(i, instant) {
    howPage = Math.max(0, Math.min(HOW_PAGES - 1, i));
    const track = $("howTrack");
    track.style.transition = instant ? "none" : "";
    track.style.transform = "translateX(" + (-howPage * 100) + "%)";
    $("howStep").textContent = (howPage + 1) + " / " + HOW_PAGES;
    [...$("howDots").children].forEach((d, k) => { d.classList.toggle("on", k === howPage); d.setAttribute("aria-selected", k === howPage); });
    $("howPrev").style.visibility = howPage ? "visible" : "hidden";
    const last = howPage === HOW_PAGES - 1;
    $("howNext").textContent = last ? "PLAY" : "Next";
    $("howNext").classList.toggle("how-play", last);
    [...track.children].forEach((pg, k) => pg.setAttribute("aria-hidden", k !== howPage));
  }
  const canvasImg = (c, cls) => '<img class="' + cls + '" alt="" src="' + c.toDataURL() + '">';
  function keycap(k, wide) { return '<span class="keycap' + (wide ? " wide" : "") + '">' + k + "</span>"; }
  function buildHow() {
    // Page 1: the player's own controls (touch or keyboard and mouse)
    const mouseSvg = '<svg class="how-mouse" viewBox="0 0 40 60" aria-hidden="true"><rect x="3" y="3" width="34" height="54" rx="17"/><path d="M20 3v18M3 21h34"/><rect x="17" y="10" width="6" height="8" rx="3" class="wheel"/></svg>';
    const fingerSvg = '<svg class="how-finger" viewBox="0 0 120 120" aria-hidden="true"><path class="trail" d="M30 90 C 50 70, 70 80, 92 40"/><path class="arrow" d="M84 36 L94 38 L92 48"/><circle class="touch" cx="30" cy="90" r="14"/><circle class="touch-dot" cx="30" cy="90" r="5"/></svg>';
    if (isTouch) {
      $("howControls").innerHTML = '<div class="ctl-touch">' + fingerSvg + "</div>";
      $("howControlsText").innerHTML = "<li><b>Drag anywhere</b> to fly up, down, left and right. Your finger never covers the rocket.</li>" +
        "<li><b>Tap</b> to start a run.</li><li><b>Laser Eyes</b> (Chogs with that trait): while one finger flies, <b>tap with a second finger</b> to fire.</li><li>Turn your phone sideways for a bigger view.</li>";
    } else {
      $("howControls").innerHTML = '<div class="ctl-row"><div class="ctl-keys"><div>' + keycap("W") + '</div><div>' + keycap("A") + keycap("S") + keycap("D") +
        '</div></div><span class="ctl-or">or</span><div class="ctl-keys"><div>' + keycap("&uarr;") + '</div><div>' + keycap("&larr;") + keycap("&darr;") + keycap("&rarr;") +
        '</div></div><span class="ctl-or">or</span>' + mouseSvg + "</div>";
      $("howControlsText").innerHTML = "<li><b>Mouse:</b> the rocket follows it. <b>Keys:</b> it stays where you leave it.</li>" +
        "<li>" + keycap("Space", true) + " or click to start. " + keycap("R") + " to play again after a crash.</li>" +
        "<li>" + keycap("E") + " fires <b>Laser Eyes</b> (Chogs with that trait). The counter bottom left shows your shots. " + keycap("F") + " full screen.</li>";
    }
    // Page 3: the real in-game pickup icons
    const I = root.ChogPickups.icons, P = cfg.game.pickups, TYPES = root.ChogPickups.TYPES;
    const bubble = type => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
      g.drawImage(I.bubbleCanvas(false, TYPES[type].color), 0, 0, 128, 128); g.drawImage(I.iconCanvas(type, false), 12, 12, 104, 104); g.drawImage(I.bubbleCanvas(true), 0, 0, 128, 128); return c; };
    const items = [
      [canvasImg(I.stardustCanvas(), "pk-ic"), "Stardust", "Every " + P.stardustPerLife + " = an extra life (max " + P.maxLives + ")."],
      [canvasImg(I.hornCanvas(), "pk-ic"), "Golden Horn", "Rare. Worth " + P.hornStardust + " Stardust."],
      [canvasImg(bubble("dash"), "pk-ic"), TYPES.dash.name, "x" + P.dashSpeedMult + " speed and smash through anything for " + P.dashSeconds + " s."],
      [canvasImg(bubble("magnet"), "pk-ic"), TYPES.magnet.name, "Pulls in Stardust and Horns for " + P.magnetSeconds + " s."],
      [canvasImg(bubble("slow"), "pk-ic"), TYPES.slow.name, "Slows everything down for " + P.slowSeconds + " s."],
      [canvasImg(bubble("nova"), "pk-ic"), TYPES.nova.name, "Clears every small obstacle on screen."],
      [canvasImg(bubble("radar"), "pk-ic"), TYPES.radar.name, "Outlines obstacles for " + P.radarSeconds + " s. Deep Cosmic Zone only."],
      [canvasImg(bubble("mystery"), "pk-ic"), TYPES.mystery.name, "A random power-up."],
    ];
    $("howPickups").innerHTML = items.map(([ic, n, d]) => '<div class="pk">' + ic + '<div><div class="pk-n">' + esc(n) + '</div><div class="pk-d">' + esc(d) + "</div></div></div>").join("");
    // Page 4: the zones as a path, with their real lengths
    const ZC = { outer: "#7a8cff", belt: "#d8a46a", drift: "#3ad0ff", deep: "#b04cff", milky: "#ffd27a" };
    const ZD = { outer: "Open space. A balanced mix to warm up.", belt: "A packed asteroid field, with big rocks.", drift: "Debris that drifts hard sideways.",
      deep: "Darker, and you see less far ahead.", milky: "The finale: everything moves." };
    $("howZones").innerHTML = cfg.game.zones.map((z, k) => '<div class="zn" style="--zc:' + ZC[z.id] + '"><div class="zn-dot">' + (k + 1) + '</div><div class="zn-body"><div class="zn-n">' +
      esc(z.name) + ' <span class="zn-t">' + T.zoneMinutes(k) + ' min</span></div><div class="zn-d">' + esc(ZD[z.id] || "") + "</div></div></div>").join("");
    // Page 5: the two modes side by side
    const tiers = Object.entries(cfg.tiers.multipliers).map(([k, v]) => '<span class="tier-chip t-' + k + '">' + k.charAt(0).toUpperCase() + k.slice(1) + " x" + Number(v).toFixed(2) + "</span>").join("");
    $("howModes").innerHTML =
      '<div class="md md-practice">' + canvasImg(Art.rookieCanvas(), "md-face") + '<div class="md-n">PRACTICE</div><ul>' +
        "<li>Fly as Rookie, the practice pilot</li><li>No wallet needed</li><li>Best distance saved on this device</li><li>Never on the leaderboard</li></ul></div>" +
      '<div class="md md-nft"><div class="md-face md-chog">CHOG</div><div class="md-n">CHOG NFT</div><ul>' +
        "<li>Connect your wallet, sign, and pick a Chog you own</li>" +
        "<li><b>Laser Eyes</b> (laser Eyes trait): " + cfg.abilities.laserEyes.charges + " shots that destroy what's in your path. " +
          (isTouch ? "Tap with a second finger to fire" : "Press " + keycap("E") + " to fire") + "</li>" +
        "<li><b>Total distance</b> = distance flown x tier:</li></ul><div class='tiers'>" + tiers + "</div>" +
        "<ul><li>Your Chog's traits style the rocket and its aura trail</li><li>Ranked on the leaderboard under your username</li><li>Daily and weekly quests earn badges</li><li>Quest streaks bank extra lives: 7 days +1, 14 days +3, 21 days +5</li></ul></div>";
    // Page 6: a sample streak, 4 days in, with the day-7 reward ahead
    $("howStreak").innerHTML = '<div class="hs-top">' + bigFlame(4, false) + '<div class="qs-big">4<span>DAY STREAK</span></div></div>' +
      '<div class="road">' + [1, 2, 3, 4, 5, 6, 7].map(d => '<div class="rd' + (d <= 4 ? " lit" : "") + (d === 5 ? " today" : "") + (d === 7 ? " reward" : "") + '">' +
        (d === 7 ? '<div class="rd-gift">' + G(HEART) + "<b>+1</b></div>" : G(Q.GLYPH_PATHS.flame)) + '<span class="rd-d">' + (d === 5 ? "TODAY" : "DAY " + d) + "</span></div>").join("") + "</div>";
    // Dots, buttons, keys and swipe
    $("howDots").innerHTML = Array.from({ length: HOW_PAGES }, (_, k) => '<button class="how-dot" role="tab" aria-label="Page ' + (k + 1) + '"></button>').join("");
    [...$("howDots").children].forEach((d, k) => { d.onclick = () => goHow(k); });
    $("howPrev").onclick = () => goHow(howPage - 1);
    $("howNext").onclick = () => { if (howPage < HOW_PAGES - 1) goHow(howPage + 1); else { show("menuPanel"); play(); } };
    window.addEventListener("keydown", e => {
      if (!$("howPanel").classList.contains("show")) return;
      if (e.key === "ArrowRight") goHow(howPage + 1);
      else if (e.key === "ArrowLeft") goHow(howPage - 1);
      else if (e.key === "Escape") show("menuPanel");
    });
    let sx = null;
    $("howViewport").addEventListener("pointerdown", e => { sx = e.clientX; });
    $("howViewport").addEventListener("pointerup", e => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) goHow(howPage + (dx < 0 ? 1 : -1));
    });
  }

  // ---------- Sound: mute buttons, M key, button clicks ----------
  function setupSound() {
    const A = root.ChogAudio;
    if (!A) { ["muteBtn", "hudMuteBtn"].forEach(id => { $(id).style.display = "none"; }); return; }
    const sync = () => {
      document.body.classList.toggle("muted", A.isMuted());
      ["muteBtn", "hudMuteBtn"].forEach(id => { $(id).title = (A.isMuted() ? "Sound off" : "Sound on") + " (M)"; });
    };
    const toggle = () => { A.unlock(); A.setMuted(!A.isMuted()); sync(); if (!A.isMuted()) A.play("click"); };
    $("muteBtn").onclick = toggle;
    $("hudMuteBtn").onclick = toggle;
    window.addEventListener("keydown", e => { if (e.code === "KeyM" && !e.repeat && !/INPUT|TEXTAREA/.test(e.target.tagName)) toggle(); });
    // A soft click on menu buttons (not while flying, and not the mute buttons themselves)
    document.addEventListener("click", e => {
      const b = e.target.closest && e.target.closest("button");
      if (b && !b.classList.contains("mute-btn") && !document.body.classList.contains("flying")) A.play("click");
    });
    sync();
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
  let homeMode;   // "practice" or "nft"; set from the saved choice at start
  function setHomeMode(m) {
    const changed = homeMode !== m && homeMode !== undefined;
    homeMode = m;
    try { localStorage.setItem("chogDashMode", m); } catch (e) {}
    $("modePractice").classList.toggle("on", m === "practice");
    $("modeNft").classList.toggle("on", m === "nft");
    movePill(!changed);
    refreshHome(changed);
  }
  // Slides the pill behind the chosen mode button
  function movePill(instant) {
    const sw = document.querySelector(".mode-switch"), on = $(homeMode === "nft" ? "modeNft" : "modePractice"), pill = $("modePill");
    if (!sw || !on.offsetWidth) return;
    sw.classList.toggle("no-anim", !!instant);
    pill.style.width = on.offsetWidth + "px";
    pill.style.transform = "translateX(" + on.offsetLeft + "px)";
    if (instant) requestAnimationFrame(() => sw.classList.remove("no-anim"));
  }
  // A quick fade-and-rise for text that changes when switching modes
  function swapIn(el) {
    if (el.animate && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches))
      el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  }
  function refreshHome(animate) {
    const nft = homeMode === "nft";
    const hint = nft
      ? (S.chog ? "Ride " + S.chog.name + ". Abilities from its traits. Ranked." : "Ride a Chog you own. Abilities from its traits. Ranked.")
      : "Fly as Rookie, the practice pilot. No wallet. Not ranked.";
    const label = nft && !S.chog ? "PICK CHOG" : "PLAY";
    const lab = $("playBtn").querySelector(".play-label");
    if ($("modeHint").textContent !== hint) { $("modeHint").textContent = hint; if (animate) swapIn($("modeHint")); }
    if (lab.textContent !== label) { lab.textContent = label; if (animate) swapIn(lab); }
    $("playBtn").classList.toggle("pick", label !== "PLAY");
    $("bestLabel").textContent = nft && S.chog ? "BEST TOTAL" : "BEST";
    $("bestValue").textContent = (nft && S.chog ? readNum("chogDashNftBest:" + S.chog.tokenId) : readNum(PRACTICE_BEST)).toLocaleString() + " m";
    $("walletChipText").textContent = S.account ? (S.username || short(S.account)) : "Connect wallet";
    $("walletDot").classList.toggle("on", !!S.account && S.chainId === cfg.collection.chainId);
    $("keyHint").textContent = "Press SPACE to " + (nft && !S.chog ? "pick a Chog" : "play") + "  ·  F for full screen";
    if (!animate) movePill(true);   // e.g. the home screen was hidden while the pill moved
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
    showEndBar(false);
    S.autoStart = false;
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
    // The best to beat this run (the same number as the BEST chip): distance in practice, total distance for this Chog
    game.configure({ bestToBeat: S.mode === "nft" && S.chog ? readNum("chogDashNftBest:" + S.chog.tokenId) : readNum(PRACTICE_BEST), bankLives: 0 });
    S.bankLives = 0;
    showEndBar(false);
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
    stopReveal();
    if (S.mode === "nft") loadQuests(); else { S.quests = null; renderQuestStrip(); }
  }

  function onStart() {
    setFlying(true);
    showEndBar(false);
    S.autoStart = false;
    $("cardBtn").style.display = "none";
    S.lastRun = null;
    $("msg").style.display = "none";
    S.runCounter++;
    S.activeRunId = S.runId;
    S.runId = null;
    stopReveal();
    renderQuestStrip();
    startLiveQuests();
  }

  function onEnd(result) {
    setFlying(false);
    clearInterval(liveTimer);
    $("questToast").classList.remove("show");
    renderQuestStrip();
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
    apiCall("/run/finish", { runId: S.activeRunId, meters: result.meters, durationMs: result.durationMs, laserUsed: result.laserUsed,
      stardust: result.stardust || 0, powerups: result.powerups || 0, horns: result.horns || 0, nearMisses: result.nearMisses || 0,
      livesUsed: result.livesUsed || 0, bankLivesUsed: result.bankLivesUsed || 0 }, S.auth && S.auth.token)
      .then(r => {
        if (run !== S.runCounter || game.state !== "dead") return;
        if (r.status === "validated" && S.lastRun) { S.lastRun.rank = r.rank || null; S.lastRun.total = r.finalScore; }
        const st = r.status === "validated"
          ? ["Validated. Total distance " + r.finalScore + " m (x" + r.multiplier + ")" + (r.rank ? ", rank " + r.rank : ""), "good"]
          : ["Not validated: " + (r.reason || r.status), "warn"];
        setMsg("CRASHED", lines(st).concat(questLines(r.quests)));
        if (r.quests && r.quests.badges.length) revealBadges(r.quests.badges);
        if (r.quests && r.quests.livesEarned) revealBadges([{ lives: r.quests.livesEarned, day: r.quests.streakDay }]);
        if (r.status === "validated") loadQuests();
      })
      .catch(e => {
        if (run !== S.runCounter || game.state !== "dead") return;
        setMsg("CRASHED", lines(["Not submitted: " + e.message, "warn"]));
      });
  }

  // ---------- Run card ----------
  // Built from the finished run, for practice and Chog NFT runs alike. Checked against the stored best
  // before onEnd updates it, so a record run gets the NEW BEST badge.
  function rememberRun(result) {
    const nft = S.mode === "nft" && S.chog;
    const z = T.zoneAt(result.meters);
    const prevBest = nft ? readNum("chogDashNftBest:" + S.chog.tokenId) : readNum(PRACTICE_BEST);
    S.lastRun = {
      practice: !nft,
      portrait: nft ? S.chog.img : Art.rookieCanvas(),
      username: S.username || (nft ? short(S.account) : "Practice pilot"),
      chogName: nft ? S.chog.name : null,
      tier: nft ? S.chog.gameplay.tier : null,
      multiplier: nft ? S.chog.gameplay.multiplier : 1,
      meters: result.meters, total: result.score,
      zoneIndex: z.index, zoneName: z.zone.name, loop: z.loop,
      durationMs: result.durationMs, stardust: result.stardust || 0, nearMisses: result.nearMisses || 0,
      newBest: (nft ? result.score : result.meters) > prevBest && result.meters > 0,
      url: /^https?:$/.test(location.protocol) ? location.host : null,
      rank: null,
      pin: nft ? myPin() : null,
    };
    $("cardBtn").style.display = result.meters > 0 ? "" : "none";
    showEndBar(true);
  }

  // ---------- Game over: PLAY AGAIN restarts straight away ----------
  function showEndBar(on) {
    $("endBar").classList.toggle("show", on);
    $("hudMenuBtn").style.display = on || document.body.classList.contains("flying") ? "none" : "block";   // Home in the bar replaces it
    if (on) {
      S.crashedAt = performance.now();
      $("endHint").textContent = isTouch ? "" : "Space or R to play again  ·  Esc for Home";
    }
  }
  function playAgain() {
    if (game.state !== "dead" || performance.now() - (S.crashedAt || 0) < 600) return;   // no accidental restarts
    closeCard();
    showEndBar(false);
    if (S.mode === "nft") {
      // A ranked run needs its run session from the server first; start as soon as it's settled
      S.autoStart = true;
      game.toReady();
    } else {
      game.toReady();
      game.start();
    }
  }
  function autoStartIfWaiting() {
    if (S.autoStart && game.state === "ready") { S.autoStart = false; game.start(); }
  }

  let cardCanvas = null, cardFormat = "wide";
  function drawCard() {
    cardCanvas = root.ChogCard.render(S.lastRun, cardFormat);
    $("cardImg").src = cardCanvas.toDataURL("image/png");
    $("cardImg").className = cardFormat;
    $("cardFmtWide").classList.toggle("on", cardFormat === "wide");
    $("cardFmtSquare").classList.toggle("on", cardFormat === "square");
  }
  async function openCard() {
    if (!S.lastRun) return;
    await root.ChogCard.ready();
    drawCard();
    $("cardShare").style.display = navigator.share ? "" : "none";   // the system share menu, where there is one
    setStatus($("cardStatus"), "");
    $("cardPanel").classList.add("show");
  }
  function closeCard() { $("cardPanel").classList.remove("show"); }
  function setCardFormat(f) { cardFormat = f; if (S.lastRun) drawCard(); }

  const cardName = () => "chog-dash-" + (S.lastRun.practice ? "practice" : "run") + "-" +
    (S.lastRun.practice ? S.lastRun.meters : S.lastRun.total) + "m-" + cardFormat + ".png";
  const cardText = () => {
    const r = S.lastRun;
    return (r.practice
      ? "I flew " + r.meters.toLocaleString() + " m in Chog Dash practice"
      : "I flew " + r.total.toLocaleString() + " m in Chog Dash riding " + r.chogName + (r.rank ? " and I'm #" + r.rank + " on the leaderboard" : "")) +
      (r.newBest ? " (new best)" : "") + ". Can you beat it? #ChogDash";
  };
  const cardUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : "");
  function cardBlob() { return new Promise(res => cardCanvas.toBlob(res, "image/png")); }

  async function saveCard() {
    if (!cardCanvas) return;
    const url = URL.createObjectURL(await cardBlob());
    const a = document.createElement("a");
    a.href = url; a.download = cardName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus($("cardStatus"), "Downloaded " + cardName(), "ok");
  }

  // System share menu (phones): the image goes straight to the app picked, including X
  async function shareCard() {
    if (!cardCanvas) return;
    const file = new File([await cardBlob()], cardName(), { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: cardText() + (cardUrl() ? " " + cardUrl() : "") });
      else await navigator.share({ text: cardText(), url: cardUrl() || undefined });
    } catch (e) {
      if (e && e.name !== "AbortError") setStatus($("cardStatus"), "Couldn't open sharing here. Use Download instead.", "err");
    }
  }

  // Share to X. On phones with file sharing, the share menu attaches the image (pick X there).
  // Elsewhere X's post link can't carry an image, so the card is copied to the clipboard (or downloaded)
  // and X opens with the text filled in, ready for the image to be pasted.
  function shareToX() {
    if (!cardCanvas) return;
    const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.canShare && navigator.share) {
      const probe = new File([new Blob([""], { type: "image/png" })], "x.png", { type: "image/png" });
      if (navigator.canShare({ files: [probe] })) { shareCard(); return; }
    }
    const intent = "https://x.com/intent/post?text=" + encodeURIComponent(cardText()) + (cardUrl() ? "&url=" + encodeURIComponent(cardUrl()) : "");
    const win = window.open(intent, "_blank");   // opened straight away so pop-up blockers allow it
    if (win) win.opener = null;
    const st = $("cardStatus");
    setStatus(st, "Opening X...");
    const copied = navigator.clipboard && window.ClipboardItem
      ? navigator.clipboard.write([new ClipboardItem({ "image/png": cardBlob() })]).then(() => true, () => false)
      : Promise.resolve(false);
    copied.then(ok => {
      if (ok) setStatus(st, "Card copied. In the X post, paste it with Ctrl+V (Cmd+V on a Mac).", "ok");
      else { saveCard().then(() => setStatus(st, "Card downloaded as " + cardName() + ". Attach it to the X post with the image button.", "ok")); }
      if (!win) setStatus(st, st.textContent + " X didn't open (pop-up blocked?): allow pop-ups for this site and press Share to X again.", "err");
    });
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
      S.bankLives ? ["Streak lives: " + S.bankLives + " banked. Used after your Stardust lives run out", "good"] : "",
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
      autoStartIfWaiting();
      return;
    }
    S.runStatus = { text: "Checking leaderboard eligibility...", kind: "" };
    renderNftReady();
    try {
      const r = await apiCall("/run/start", { tokenId: S.chog.tokenId }, S.auth.token);
      if (req !== S.sessionReq) return;
      S.runId = r.runId;
      S.runStatus = { text: "Eligible: this run will be submitted (server-verified Tier " + r.tier + ", x" + r.multiplier + ")", kind: "good" };
      // Streak lives from the bank, only before the run starts
      if (game.state === "ready") { S.bankLives = r.bankLives || 0; game.configure({ bankLives: S.bankLives }); }
    } catch (e) {
      if (req !== S.sessionReq) return;
      if (e.status === 401) S.auth = null;
      S.runStatus = { text: "Not eligible for the leaderboard: " + e.message, kind: "warn" };
    }
    if (game.state === "ready") renderNftReady();
    autoStartIfWaiting();
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
    const pin = e.pin && Q.badgeFor(e.pin.id) ? badgeIcon(Q.badgeFor(e.pin.id), e.pin.tier, "mini lb-pin") : "";
    const badges = e.badges ? '<span class="lb-badges" title="Quest badges">' + GLYPHS.star + e.badges + "</span>" : "";
    return '<div class="who"><span class="nm">' + esc(e.username || short(e.wallet)) + "</span>" + pin + badges + '</div><div class="chog">' +
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

  // ---------- Quests (Chog NFT holders only) ----------
  // The server decides all progress from validated Chog NFT runs. The page shows it, and during a run
  // predicts completions from the live run so it can celebrate straight away.
  const Q = root.ChogQuests;
  const G = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const GLYPHS = { lock: G("M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2"), pin: G("M9 3h6l-1 6 4 3v2H6v-2l4-3zM12 14v7") };
  Object.keys(Q.GLYPH_PATHS).forEach(k => { GLYPHS[k] = G(Q.GLYPH_PATHS[k]); });
  const DIFF = { easy: "EASY", medium: "MEDIUM", hard: "HARD", weekly: "WEEKLY" };
  let questTimer = null, liveTimer = null, revealTimer = null, revealQueue = [];

  // A badge: the tier's frame shape in its metal, the quest's glyph in its difficulty colour. Not earned: a dim outline.
  function badgeIcon(b, tier, cls) {
    const t = Q.TIERS[tier];
    return '<span class="qbadge' + (t ? " on t-" + t.id : "") + (cls ? " " + cls : "") + '" style="--c:' + b.color + (t ? ";--m:" + t.metal : "") + '">' +
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="fr" d="' + Q.SHAPE_PATHS[t ? t.shape : "circle"] + '"/>' +
      '<path class="gl" transform="translate(12 12)" d="' + Q.GLYPH_PATHS[b.glyph] + '"/></svg></span>';
  }
  const tierName = k => (Q.TIERS[k] ? Q.TIERS[k].name : "");
  const fmtClock = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
  const livesWord = n => n + " " + (n === 1 ? "life" : "lives");
  function fmtLeft(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d ? d + "d " + h + "h" : h ? h + "h " + (m % 60) + "m" : (m % 60) + "m";
  }
  function fmtProgress(q) {
    const def = Q.ALL[q.id], unit = def.metric === "meters" ? " m" : def.metric === "cleanSeconds" ? " s" : "";
    if (def.metric === "zone") return q.done ? "Reached" : "Not yet";
    return q.progress.toLocaleString() + " / " + q.target.toLocaleString() + unit;
  }
  function questCard(q) {
    const pct = Math.round((q.progress / q.target) * 100);
    return '<div class="qcard d-' + q.difficulty + (q.done ? " done" : "") + '" style="--c:' + q.badge.color + '">' +
      badgeIcon(q.badge, q.badge.tier) +
      '<div class="qmain"><div class="qtop"><span class="qtitle">' + esc(q.title) + '</span><span class="qdiff">' + DIFF[q.difficulty] + "</span></div>" +
      '<div class="qdesc">' + esc(q.desc) + "</div>" +
      '<div class="qbar"><i style="width:' + (q.done ? 100 : pct) + '%"></i></div>' +
      '<div class="qprog">' + (q.done ? "Complete" + (q.badge.tier >= 0 ? " &middot; " + tierName(q.badge.tier) + " badge" : "") : fmtProgress(q)) + "</div></div></div>";
  }

  // Lines for the crash screen after a validated run
  function questLines(q) {
    if (!q) return [];
    const out = [];
    q.completed.forEach(id => { const b = Q.badgeFor(id); if (b) out.push(["Quest complete: " + b.name, "good"]); });
    q.badges.forEach(u => out.push([(u.id === "streak" ? "Streak" : Q.badgeFor(u.id).name) + ": " + tierName(u.tier) + " badge", "good"]));
    if (q.streakDay) out.push(["Streak day " + q.streakDay + "!" + (q.livesEarned ? " +" + q.livesEarned + " streak " + (q.livesEarned === 1 ? "life" : "lives") + " banked" : ""), "good"]);
    else if (q.today === 3 && q.playMsToday < Q.STREAK_PLAY_MS) out.push(["Dailies done. Fly " + fmtClock(Q.STREAK_PLAY_MS - q.playMsToday) + " more today to count it for your streak", ""]);
    if (out.length) $("questBtn").classList.add("has-new");
    return out;
  }

  // ----- Loading, and today's quests on the ready and crash screens -----
  async function loadQuests() {
    if (S.mode !== "nft" || !authValid()) { S.quests = null; renderQuestStrip(); return null; }
    try { S.quests = await apiCall("/quests", null, S.auth.token); }
    catch (e) { if (e.status === 403 || e.status === 401 || e.offline) S.quests = null; }
    renderQuestStrip();
    return S.quests;
  }
  function renderQuestStrip() {
    const el = $("questStrip"), r = S.quests;
    const on = !!r && S.mode === "nft" && (game.state === "ready" || game.state === "dead");
    el.classList.toggle("show", on);
    if (!r) { el.innerHTML = ""; return; }
    const done = r.daily.filter(q => q.done).length;
    el.innerHTML = '<div class="qs-h">TODAY\'S QUESTS <b>' + done + "/3</b></div>" + r.daily.map(q =>
      '<div class="qs-row' + (q.done ? " done" : "") + '" style="--c:' + q.badge.color + '">' + badgeIcon(q.badge, q.done ? Math.max(0, q.badge.tier) : -1, "mini") +
      '<div class="qs-txt"><div class="qs-t">' + esc(q.title) + '</div><div class="qbar"><i style="width:' + (q.done ? 100 : Math.round((q.progress / q.target) * 100)) + '%"></i></div>' +
      '<div class="qs-p">' + (q.done ? "Complete" : fmtProgress(q)) + "</div></div></div>").join("") +
      '<div class="qs-streak' + (r.todayCounted ? " done" : r.streak ? " risk" : "") + '">' + GLYPHS.flame + "<span>" + r.streak + "-day streak &middot; " +
        (r.todayCounted ? "today counted" : (r.streak ? "ends in " + fmtLeft(r.dailyResetAt - r.serverTime) + " &middot; " : "") +
          fmtClock(Math.min(r.playMsToday, r.streakPlayMs)) + " / " + fmtClock(r.streakPlayMs) + " flown") + "</span></div>";
  }

  // ----- During a run: "Quest complete" as soon as the live run reaches a target -----
  function startLiveQuests() {
    clearInterval(liveTimer);
    S.liveDone = new Set();
    if (!S.quests || S.mode !== "nft") return;
    liveTimer = setInterval(checkLiveQuests, 400);
  }
  function checkLiveQuests() {
    const live = game.live(), r = S.quests;
    if (!live || !r) return;
    const stats = Q.runStats(live);
    const dailiesNow = r.daily.filter(q => q.done || S.liveDone.has(q.id)).length - r.daily.filter(q => q.done).length;
    r.daily.concat([r.weekly]).forEach(q => {
      const def = Q.ALL[q.id];
      if (q.done || S.liveDone.has(q.id) || def.metric === "runs") return;   // a run counts once it ends
      const v = def.metric === "dailies" ? q.progress + dailiesNow : def.scope === "run" ? stats[def.metric] : q.progress + stats[def.metric];
      if (v >= q.target) { S.liveDone.add(q.id); questToast(q); }
    });
  }
  function questToast(q) {
    const el = $("questToast");
    el.style.setProperty("--c", q.badge.color);
    el.innerHTML = badgeIcon(q.badge, Math.max(0, q.badge.tier), "mini") + '<div><div class="qt-k">QUEST COMPLETE</div><div class="qt-n">' + esc(q.title) + "</div></div>";
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    sfx("quest");
  }
  function sfx(name) { if (root.ChogAudio) root.ChogAudio.play(name); }

  // ----- After the run: each new badge or tier is revealed in turn -----
  function revealBadges(list) {
    revealQueue = revealQueue.concat(list);
    if (!revealTimer) nextReveal();
  }
  function nextReveal() {
    const el = $("badgeReveal"), u = revealQueue.shift();
    if (!u || game.state !== "dead") { el.classList.remove("show"); revealTimer = null; revealQueue = []; return; }
    if (u.lives) {   // streak lives milestone: a big heart
      el.style.setProperty("--c", "#ff7a3d"); el.style.setProperty("--m", "#ffb27a");
      el.innerHTML = '<div class="br-ring"></div><div class="br-heart">' + G(HEART) + "<b>+" + u.lives + "</b></div>" +
        '<div class="br-k">DAY ' + u.day + ' STREAK</div><div class="br-n">+' + u.lives + " STREAK " + (u.lives === 1 ? "LIFE" : "LIVES") + "</div>";
      el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
      sfx("newBest");
      revealTimer = setTimeout(nextReveal, 2600);
      return;
    }
    const b = Q.badgeFor(u.id);
    el.style.setProperty("--c", b.color);
    el.style.setProperty("--m", Q.TIERS[u.tier].metal);
    el.innerHTML = '<div class="br-ring"></div>' + badgeIcon(b, u.tier, "big") +
      '<div class="br-k">' + (u.tier === 0 ? "NEW BADGE" : tierName(u.tier).toUpperCase() + " BADGE") + '</div><div class="br-n">' + esc(b.name) + "</div>";
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    sfx("badge");
    revealTimer = setTimeout(nextReveal, 2600);
  }
  function stopReveal() { clearTimeout(revealTimer); revealTimer = null; revealQueue = []; $("badgeReveal").classList.remove("show"); }

  // ----- The Quests panel -----
  function questLocked(text, action) {
    $("questBody").innerHTML = '<div class="lb-empty q-locked">' + GLYPHS.lock + '<div class="t">Holders only</div><p>' + esc(text) + "</p></div>";
    if (action) {
      const b = document.createElement("button");
      b.textContent = action[0]; b.onclick = action[1];
      $("questBody").firstChild.appendChild(b);
    }
  }

  async function openQuests() {
    show("questPanel");
    $("questBtn").classList.remove("has-new");
    const st = $("questStatus");
    st.textContent = ""; st.className = "lb-status";
    if (!S.account || !authValid()) {
      questLocked("Quests are for Chog Genesis holders. Connect and sign in with the wallet that holds your Chog to see today's quests.",
        ["Connect wallet", () => { setHomeMode("nft"); openNft(); }]);
      return;
    }
    $("questBody").innerHTML = '<div class="lb-row skeleton"></div>'.repeat(4);
    let r;
    try { r = await apiCall("/quests", null, S.auth.token); }
    catch (e) {
      if (e.status === 403) return questLocked("This wallet holds no Chog Genesis NFTs. Quests and badges are for holders. You can still fly in practice mode.");
      $("questBody").innerHTML = "";
      st.className = "lb-status err";
      st.textContent = e.offline ? "The quest server isn't reachable from here. It runs on the deployed site (see README)." : e.message;
      return;
    }
    S.quests = r;
    renderQuests(r);
  }

  // ----- Streak card: a flame that grows with the streak, the road to the next streak lives, banked hearts -----
  const HEART = "M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z";
  const FLAME_BIG = "M24 4c1 8 10 12 10 22a10 10 0 0 1-20 0c0-6 4-9 4-13 2.4 2 4 4.4 4 7 3-5 2-11 2-16z";
  const FLAME_CORE = "M24 24c.5 3 4 5 4 9a4 4 0 0 1-8 0c0-2.5 1.5-3.5 1.5-5 1 .8 1.6 1.7 1.6 2.7.9-1.7.9-4 .9-6.7z";
  // Flame stages: grows at 7 days, burns hotter at 14, turns blue at 30. Grey when the streak is at risk or not started.
  const flameStage = n => (n >= 30 ? "f4" : n >= 14 ? "f3" : n >= 7 ? "f2" : n >= 1 ? "f1" : "f0");
  function bigFlame(n, risk) {
    return '<div class="sflame ' + flameStage(n) + (risk ? " risk" : "") + '"><svg viewBox="0 0 48 48" aria-hidden="true"><path class="fo" d="' + FLAME_BIG +
      '"/><path class="fi" d="' + FLAME_CORE + '"/></svg></div>';
  }
  function hearts(n, max) {
    const shown = Math.min(n, max || 6);
    return '<span class="hearts">' + Array.from({ length: shown }, () => G(HEART)).join("") + (n > shown ? '<b class="hx">+' + (n - shown) + "</b>" : "") + "</span>";
  }
  // The current 7-day block of the streak (days 1-7, 8-14 ...), with today and the reward box at its end
  function streakRoad(r) {
    const n = r.streak, counted = r.todayCounted;
    const start = counted && n > 0 && n % 7 === 0 ? n - 7 : 7 * Math.floor(n / 7);
    let out = "";
    for (let d = start + 1; d <= start + 7; d++) {
      const lit = d <= n, today = counted ? d === n : d === n + 1, reward = d === start + 7;
      const lives = Q.streakLives(d);
      out += '<div class="rd' + (lit ? " lit" : "") + (today ? " today" : "") + (reward ? " reward" : "") + '">' +
        (reward ? '<div class="rd-gift">' + G(HEART) + "<b>+" + lives + "</b></div>" : G(Q.GLYPH_PATHS.flame)) +
        '<span class="rd-d">' + (today ? "TODAY" : "DAY " + d) + "</span></div>";
    }
    return '<div class="road">' + out + "</div>";
  }
  function streakCard(r) {
    const n = r.streak, risk = n > 0 && !r.todayCounted, doneToday = r.daily.filter(q => q.done).length;
    const status = r.todayCounted ? "Today counts. Come back tomorrow to keep it going."
      : risk ? 'Streak ends in <b id="qsRisk">' + fmtLeft(r.dailyResetAt - r.serverTime) + "</b>. Finish today to keep it."
      : "Finish 3 dailies and fly 5 minutes today to start your streak.";
    return '<div class="qstreak' + (n ? " on" : "") + (risk ? " at-risk" : "") + '">' +
      '<div class="qs-hero">' + bigFlame(n, risk || !n) +
        '<div class="qs-mid"><div class="qs-big">' + n + '<span>DAY STREAK</span></div><div class="qs-d">' + status + "</div></div>" +
        '<div class="qs-best"><span>BEST</span><b>' + r.bestStreak + "</b><span>DAYS</span></div></div>" +
      '<div class="qs-req"><div class="qr' + (doneToday === 3 ? " ok" : "") + '"><span>Dailies</span><b>' + doneToday + " / 3</b>" +
          '<i style="width:' + Math.round((doneToday / 3) * 100) + '%"></i></div>' +
        '<div class="qr' + (r.playMsToday >= r.streakPlayMs ? " ok" : "") + '"><span>Flown today</span><b>' + fmtClock(Math.min(r.playMsToday, r.streakPlayMs)) + " / " + fmtClock(r.streakPlayMs) + "</b>" +
          '<i style="width:' + Math.min(100, Math.round((r.playMsToday / r.streakPlayMs) * 100)) + '%"></i></div></div>' +
      streakRoad(r) +
      '<div class="qs-lives" title="Every 7 days in a row banks streak lives: 7 days +1, 14 days +3, 21 days +5, and so on. They are used after your Stardust lives, in Chog NFT runs.">' +
        '<div class="ql-h">STREAK LIVES</div>' + (r.bankLives ? hearts(r.bankLives) : '<span class="ql-none">None banked yet</span>') +
        '<div class="ql-next">Next: ' + G(HEART) + "<b>+" + r.nextLives.lives + "</b> at day " + r.nextLives.at + "</div></div>" +
      (r.nextStreakBadge ? '<div class="qs-d qs-badge-next">Streak badge: next tier at ' + r.nextStreakBadge + " days in a row.</div>" : "") +
    "</div>";
  }

  function renderQuests(r) {
    const skew = r.serverTime - Date.now();
    const doneToday = r.daily.filter(q => q.done).length;
    const mine = {};
    r.badges.forEach(b => { mine[b.id] = b; });
    const all = Q.allBadges().sort((a, b) => (a.id === "streak" ? -1 : b.id === "streak" ? 1 : 0));
    $("questBody").innerHTML = streakCard(r) +
      '<div class="qhead"><span>DAILY</span><span class="qreset" id="qResetDay"></span></div>' +
      r.daily.map(questCard).join("") +
      '<div class="qhead"><span>WEEKLY</span><span class="qreset" id="qResetWeek"></span></div>' +
      questCard(r.weekly) +
      '<div class="qhead"><span>BADGES</span><span class="qreset">' + r.badges.length + " / " + all.length + "</span></div>" +
      '<div class="qtiers">' + Q.TIERS.map((t, k) => badgeIcon({ color: "#a9b1c2", glyph: "star" }, k, "mini") + "<span>" + t.name + "</span>").join("") + "</div>" +
      '<div class="qbadges">' + all.map(b => '<button class="qb' + (mine[b.id] ? " on" : "") + (r.pin === b.id ? " pinned" : "") + '" data-id="' + b.id + '" title="' + esc(b.name) + '">' +
        badgeIcon(b, mine[b.id] ? mine[b.id].tier : -1) + (r.pin === b.id ? '<span class="qpin">' + GLYPHS.pin + "</span>" : "") + "</button>").join("") + "</div>" +
      '<div class="qbinfo" id="qbInfo">Tap a badge to see how to earn it and how rare it is.</div>' +
      '<p class="lb-rule">Only validated Chog NFT runs count. Dailies reset at 00:00 UTC, the weekly quest on Monday. Badges level up: Bronze, Silver, Gold, Platinum.</p>';
    [...document.querySelectorAll("#questBody .qb")].forEach(el => { el.onclick = () => badgeInfo(r, el.dataset.id); });
    const tick = () => {
      const now = Date.now() + skew;
      if (now >= r.dailyResetAt) { openQuests(); return; }
      if ($("qsRisk")) $("qsRisk").textContent = fmtLeft(r.dailyResetAt - now);
      $("qResetDay").textContent = "New quests in " + fmtLeft(r.dailyResetAt - now);
      $("qResetWeek").textContent = "Resets in " + fmtLeft(r.weeklyResetAt - now);
    };
    clearInterval(questTimer);
    tick();
    questTimer = setInterval(tick, 30000);
  }

  function badgeInfo(r, id) {
    const b = r.badges.find(x => x.id === id) || Object.assign(Q.badgeFor(id), { tier: -1, count: 0, best: 0 });
    const streak = id === "streak", steps = streak ? Q.STREAK_TIER_AT : Q.QUEST_TIER_AT;
    const have = streak ? b.best : b.count, k = b.tier + 1;
    const next = k < steps.length ? "Next: " + Q.TIERS[k].name + " at " + steps[k] + (streak ? " days in a row (best " + have + ")" : " completions (" + have + "/" + steps[k] + ")") : "Top tier reached";
    const pct = r.rarity[id] || 0;
    const rare = r.players ? "Earned by " + (pct > 0 && pct < 1 ? "<1" : Math.round(pct)) + "% of pilots &middot; " + Q.rarity(pct) : "";
    $("qbInfo").innerHTML = '<div class="qi-top">' + badgeIcon(b, b.tier) + '<div><b>' + esc(b.name) + "</b>" +
      (b.tier >= 0 ? ' <span class="qi-tier" style="--m:' + Q.TIERS[b.tier].metal + '">' + tierName(b.tier).toUpperCase() + "</span>" : ' <span class="qi-lock">NOT EARNED</span>') +
      '<div class="qi-d">' + esc(b.desc) + "</div><div class=\"qi-d\">" + next + "</div>" + (rare ? '<div class="qi-r">' + rare + "</div>" : "") + "</div></div>";
    if (b.tier >= 0) {
      const btn = document.createElement("button");
      btn.className = "ghost qi-pin";
      btn.textContent = r.pin === id ? "Unpin from my name" : "Pin next to my name";
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const out = await apiCall("/badge/pin", { id: r.pin === id ? null : id }, S.auth.token);
          r.pin = out.pin;
          renderQuests(r);
          badgeInfo(r, id);
        } catch (e) { btn.disabled = false; btn.textContent = e.message; }
      };
      $("qbInfo").appendChild(btn);
    }
  }
  // The pinned badge with its tier, for the leaderboard and the run card
  function myPin() {
    const r = S.quests, b = r && r.pin && r.badges.find(x => x.id === r.pin);
    return b ? { id: b.id, tier: b.tier } : null;
  }

  root.ChogUI = { start, _state: S, _game: () => game };
})(window);
