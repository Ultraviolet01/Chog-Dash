/*
 * Menus and flow: practice mode, Chog NFT mode (wallet, ownership, metadata), demo mode, run eligibility,
 * score submission and the leaderboard view.
 */
(function (root) {
  const cfg = root.ChogConfig, T = root.ChogTraits, Chain = root.ChogChain, Meta = root.ChogMetadata, Art = root.ChogArt,
    Demo = root.ChogDemo, TKT = root.ChogTickets;
  const $ = id => document.getElementById(id);
  const dev = new URLSearchParams(location.search).get("dev") || "";
  const PRACTICE_BEST = "chogDashPracticeBest";
  // Touch screen: a coarse pointer, or touch support without a mouse/trackpad as the main pointer (some phones and
  // in-app browsers don't report a coarse pointer). The same test the game uses for the round LASER button.
  const isTouch = !!window.matchMedia && (matchMedia("(pointer: coarse)").matches ||
    (("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0) && !matchMedia("(pointer: fine)").matches));

  let game;
  const S = {
    mode: null,
    provider: null, account: null, chainId: null,
    chog: null,             // { tokenId, name, metadata, gameplay, imageUrl, riderCanvas, riderPoses }
    demoChog: null,         // the same, for one of the 5 demo Chogs (demo: true)
    auth: null, authError: "",
    // Tickets and the weekly pool (Chog NFT mode): ticketsOn once a pool contract is live; pool = GET /pool
    ticketsOn: false, tickets: null, pool: null, tkCount: 1,
    runId: null, activeRunId: null, activeWait: null, sessionWait: null, startedReq: -1, runStatus: { text: "", kind: "" }, sessionReq: 0, runCounter: 0,
    selectReq: 0, holdingsReq: 0, signReq: 0, metaCache: {},
    username: null,
    lastRun: null,          // the finished run, for the run card
  };

  // ---------- Helpers ----------
  const short = a => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function show(panelId) {
    ["menuPanel", "nftPanel", "lbPanel", "howPanel", "questPanel", "demoPanel", "ticketPanel", "careerPanel"].forEach(id => $(id).classList.toggle("show", id === panelId));
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
    return base + (laser ? (isTouch ? " Tap the LASER button (bottom right) to fire Laser Eyes." : " Press E to fire Laser Eyes.") : "");
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
    loadPool();   // shows the Tickets button once the pool contract is live
    // A shared career link: ?chog=<token id> opens that Chog's career
    const deepChog = new URLSearchParams(location.search).get("chog");
    if (deepChog && /^\d{1,6}$/.test(deepChog)) setTimeout(() => openCareer(deepChog, { back: "menuPanel" }), 0);
    $("modePractice").onclick = () => setHomeMode("practice");
    $("modeNft").onclick = () => setHomeMode("nft");
    $("modeDemo").onclick = () => setHomeMode("demo");
    $("demoBack").onclick = () => show("menuPanel");
    $("demoReset").onclick = () => { Demo.reset(); clearDemoCareers(); setStatus($("demoStatus"), "Demo progress reset: quests, badges and the streak start from zero."); $("demoStatus").className = "lb-status good"; };
    $("playBtn").onclick = play;
    $("walletChip").onclick = openNft;
    $("lbBtn").onclick = () => openLeaderboard();
    $("lbTabNft").onclick = () => openLeaderboard("nft");
    $("lbTabDemo").onclick = () => openLeaderboard("demo");
    $("howBtn").onclick = openHow;
    $("nftBack").onclick = () => { const back = S.nftReturn || "menuPanel"; S.nftReturn = null; back === "demoPanel" ? openDemo() : show(back); };
    $("lbBack").onclick = () => show("menuPanel");
    $("lbPrev").onclick = () => openLeaderboard("nft", lbWeek - 1);
    $("lbNext").onclick = () => openLeaderboard("nft", lbWeek + 1);
    $("ticketBtn").onclick = openTickets;
    $("tkBack").onclick = closeTickets;
    $("tkMinus").onclick = () => setTicketCount(S.tkCount - 1);
    $("tkPlus").onclick = () => setTicketCount(S.tkCount + 1);
    document.querySelectorAll(".tk-quick button").forEach(b => { b.onclick = () => setTicketCount(Number(b.dataset.n)); });
    $("tkBuyBtn").onclick = () => buyTickets(S.tkCount);
    $("tkGetChog").href = cfg.tickets.buyUrl;
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
      if ($("noTicket").classList.contains("show")) { if (e.code === "Escape") closeNoTicket(); return; }   // the prompt's own buttons take Space/Enter
      if (!$("menuPanel").classList.contains("show") || e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); play(); }
    });
    let saved = "practice";
    try { saved = localStorage.getItem("chogDashMode") || "practice"; } catch (e) {}
    setHomeMode(saved === "nft" || saved === "demo" ? saved : "practice");
    $("hudMenuBtn").onclick = backToMenu;
    $("switchNet").onclick = switchNetwork;
    $("signInBtn").onclick = signInAndScan;
    $("holdingsRetry").onclick = loadHoldings;
    $("pilotSave").onclick = savePilot;
    $("pilotInput").addEventListener("keydown", e => { if (e.key === "Enter") savePilot(); });
    $("rideBtn").onclick = () => rideChog();
    $("careerPill").onclick = () => {
      const demo = homeMode === "demo", chog = demo ? S.demoChog : S.chog;
      if (chog) openCareer(chog.tokenId, { demo });
      else if (demo) openDemo();
      else openCareer(null);
    };
    $("careerFind").onsubmit = e => {
      e.preventDefault();
      const id = $("careerFindId").value.trim();
      if (/^\d{1,6}$/.test(id)) openCareer(id, { back: careerReturn || "menuPanel" });
      else { $("careerStatus").className = "lb-status err"; $("careerStatus").textContent = "Enter a token ID (a whole number)."; }
    };
    $("bestChip").onclick = () => {
      const demo = homeMode === "demo", chog = demo ? S.demoChog : homeMode === "nft" ? S.chog : null;
      if (chog) openCareer(chog.tokenId, { demo });
    };
    $("chosenCareerBtn").onclick = () => S.chog && openCareer(S.chog.tokenId);
    $("careerBack").onclick = closeCareer;
    $("careerShare").onclick = () => {
      if (!careerShown) return;
      const url = location.origin + location.pathname + "?chog=" + careerShown.id, st = $("careerStatus");
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject(new Error("no clipboard")))
        .then(() => { st.className = "lb-status good"; st.textContent = "Link copied: " + url; }, () => { st.className = "lb-status"; st.textContent = url; });
    };
    $("ntBuy").onclick = () => { closeNoTicket(); openTickets(); };
    $("ntPlay").onclick = () => { closeNoTicket(); rideChog({ unranked: true }); };
    $("ntClose").onclick = closeNoTicket;
    $("cardBtn").onclick = openCard;
    $("againBtn").onclick = playAgain;
    $("endHomeBtn").onclick = backToMenu;
    $("endLbBtn").onclick = () => { const board = S.mode === "demo" ? "demo" : "nft"; backToMenu(); openLeaderboard(board); };
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
  const HOW_PAGES = 8;
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
        "<li><b>Tap</b> to start a run.</li><li><b>Laser Eyes</b> (Chogs with that trait): fly with one thumb, tap the <b>LASER button</b> (bottom right) with the other.</li><li>Turn your phone sideways for a bigger view.</li>";
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
          (isTouch ? "Tap the LASER button (bottom right) to fire" : "Press " + keycap("E") + " to fire") + "</li>" +
        "<li><b>Total distance</b> = distance flown x tier:</li></ul><div class='tiers'>" + tiers + "</div>" +
        "<ul><li>Your Chog's traits style the rocket and its aura trail</li><li>Tickets: $0.50 in $CHOG per ranked run. The weekly leaderboard's top 10 share the week's prize pool (resets Monday 00:00 UTC)</li><li>Ranked under your username</li><li>Daily and weekly quests earn badges</li><li>Quest streaks bank extra lives: 7 days +1, 14 days +3, 21 days +5</li></ul></div>" +
      '<p class="how-demo"><span class="demo-tag">DEMO</span> No Chog yet? The <b>DEMO</b> tab lets you fly 5 demo Chogs with every Chog NFT feature, and has its own DEMO leaderboard.</p>';
    // Page 6: a sample streak, 4 days in, with the day-7 reward ahead
    $("howStreak").innerHTML = '<div class="hs-top">' + bigFlame(4, false) + '<div class="qs-big">4<span>DAY STREAK</span></div></div>' +
      '<div class="road">' + [1, 2, 3, 4, 5, 6, 7].map(d => '<div class="rd' + (d <= 4 ? " lit" : "") + (d === 5 ? " today" : "") + (d === 7 ? " reward" : "") + '">' +
        (d === 7 ? '<div class="rd-gift">' + G(HEART) + "<b>+1</b></div>" : G(Q.GLYPH_PATHS.flame)) + '<span class="rd-d">' + (d === 5 ? "TODAY" : "DAY " + d) + "</span></div>").join("") + "</div>";
    // Page 7: tickets and the weekly prize pool (the shares come from config)
    const TK = cfg.tickets, price = "$" + TK.priceUsd.toFixed(2), top = Math.max(...TK.split);
    const TICKET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>';
    $("howTicketViz").innerHTML =
      '<div class="tk-flow"><div class="tk-step">' + TICKET + "<b>" + price + "</b><span>1 ticket = 1 ranked run</span></div>" +
      '<i class="tk-arrow" aria-hidden="true"></i><div class="tk-step"><b>POOL</b><span>All ticket $CHOG, no fee</span></div>' +
      '<i class="tk-arrow" aria-hidden="true"></i><div class="tk-step"><b>TOP 10</b><span>Paid every week</span></div></div>' +
      '<div class="tk-split" aria-label="Prize shares for ranks 1 to 10">' + TK.split.map((pc, i) =>
        '<div class="tk-bar"><span class="tk-pc">' + pc + '%</span><i style="height:' + Math.round(8 + 46 * pc / top) + 'px"></i><span class="tk-rk">' + (i + 1) + "</span></div>").join("") + "</div>";
    $("howTicketText").innerHTML = [
      "<b>Tickets:</b> " + price + " in $CHOG each. 1 ticket = 1 ranked Chog NFT run. Buy up to " + TK.maxPerBuy + " at a time from <b>Tickets</b> on the home screen. They never expire.",
      "<b>Buying:</b> get $CHOG on nad.fun. Your wallet approves the exact amount, then pays it into the pool contract on Monad.",
      "<b>Used at take-off:</b> a ticket is spent when your rocket takes off. Your best ticketed run of the week counts.",
      "<b>Weekly prizes:</b> the board resets every Monday 00:00 UTC. The top 10 share the pool (shares above), paid to their wallets after a " + TK.reviewHours + "-hour check. Unearned shares roll over.",
      "<b>No ticket?</b> You can still fly and do quests, but the run isn't ranked. Practice and Demo are always free.",
    ].map(t => "<li>" + t + "</li>").join("");
    // Page 8: a sample career, and the trait of the week with the next ones
    const wk0 = thisWeek(), wb = pctBonus(cfg.weeklyTrait.bonus);
    $("howCareerViz").innerHTML =
      '<div class="hc-card"><div class="cr-lvtop"><span class="gc-lv big">LV<b>4</b></span><div><b>Level 4</b><span>780 / 1,000 XP</span></div></div>' +
        '<div class="go-bar"><i style="width:45%"></i></div><div class="cr-titles"><span class="cr-chip on">First Flight</span><span class="cr-chip on">Asteroid Belt Veteran</span><span class="cr-chip">Galactic Drifter</span></div></div>' +
      '<div class="hc-weeks">' + [0, 1, 2].map(k => { const w = T.weeklyTrait(wk0 + k); return '<div class="hc-week' + (k ? "" : " now") + '"><span>' +
        (k ? "From " + new Date(w.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "THIS WEEK") + "</span><b>" + esc(w.label) + "</b><i>" + wb + "</i></div>"; }).join("") + "</div>";
    $("howCareerText").innerHTML = [
      "<b>Every Chog has a career:</b> each run earns its Chog XP (1 per 20 m flown, +50 for every zone reached past the first). Chogs level up and earn titles like Asteroid Belt Veteran, Frequent Flyer and Weekly Champion.",
      "<b>It belongs to the Chog, not the wallet:</b> sell or trade the NFT and its level, titles and run history go with it. A well-flown Chog has a story.",
      "<b>Anyone can look:</b> tap a pilot on Ranks, or Career on your Chog, to see its level, titles, weekly honors and recent runs. Each career has its own link.",
      "<b>Trait of the week:</b> every Monday a different trait is featured (" + cfg.weeklyTrait.rotation.length + " in rotation). Chogs with it get " + wb + " total distance that week, so different Chogs get their moment.",
      "<b>Demo Chogs</b> have careers and the trait of the week too, kept on your device.",
    ].map(t => "<li>" + t + "</li>").join("");
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

  // ---------- Sound: speaker buttons open the sound panel (music / sound effects), M key, button clicks ----------
  function setupSound() {
    const A = root.ChogAudio, panel = $("soundPanel");
    if (!A) { ["muteBtn", "hudMuteBtn"].forEach(id => { $(id).style.display = "none"; }); return; }
    let anchor = null;
    const sync = () => {
      document.body.classList.toggle("muted", A.isMuted());
      $("musicTgl").setAttribute("aria-checked", A.musicOn() ? "true" : "false");
      $("sfxTgl").setAttribute("aria-checked", A.sfxOn() ? "true" : "false");
      const t = A.isMuted() ? "Sound off" : !A.musicOn() ? "Music off" : !A.sfxOn() ? "Sound effects off" : "Sound on";
      ["muteBtn", "hudMuteBtn"].forEach(id => { $(id).title = t + " (M)"; });
    };
    const close = () => { panel.classList.remove("show"); anchor = null; };
    const open = btn => {
      anchor = btn; panel.classList.add("show");
      const r = btn.getBoundingClientRect(), w = panel.offsetWidth;
      panel.style.top = Math.round(r.bottom + 8) + "px";
      panel.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.right - w))) + "px";
    };
    const onBtn = e => { A.unlock(); if (anchor === e.currentTarget) close(); else open(e.currentTarget); };
    $("muteBtn").onclick = onBtn;
    $("hudMuteBtn").onclick = onBtn;
    $("musicTgl").onclick = () => { A.unlock(); A.setMusic(!A.musicOn()); sync(); };
    $("sfxTgl").onclick = () => { A.unlock(); A.setSfx(!A.sfxOn()); sync(); };
    // Click outside closes the panel; Esc closes it without leaving the screen; any other key (like Space to fly) closes it too
    document.addEventListener("pointerdown", e => { if (anchor && !panel.contains(e.target) && !e.target.closest(".mute-btn")) close(); });
    window.addEventListener("keydown", e => {
      if (!anchor || e.code === "KeyM") return;
      close();
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    window.addEventListener("resize", close);
    // M switches all sound off, or back on
    const toggleAll = () => { A.unlock(); A.setMuted(!A.isMuted()); sync(); if (!A.isMuted()) A.play("click"); };
    window.addEventListener("keydown", e => { if (e.code === "KeyM" && !e.repeat && !/INPUT|TEXTAREA/.test(e.target.tagName)) toggleAll(); });
    // A soft click on menu buttons (not while flying, and not the speaker buttons themselves)
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
  let homeMode;   // "practice", "nft" or "demo"; set from the saved choice at start
  function setHomeMode(m) {
    const changed = homeMode !== m && homeMode !== undefined;
    homeMode = m;
    try { localStorage.setItem("chogDashMode", m); } catch (e) {}
    $("modePractice").classList.toggle("on", m === "practice");
    $("modeNft").classList.toggle("on", m === "nft");
    $("modeDemo").classList.toggle("on", m === "demo");
    movePill(!changed);
    refreshHome(changed);
  }
  // Slides the pill behind the chosen mode button
  function movePill(instant) {
    const sw = document.querySelector(".mode-switch"), on = $(homeMode === "nft" ? "modeNft" : homeMode === "demo" ? "modeDemo" : "modePractice"), pill = $("modePill");
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
    const demo = homeMode === "demo", nft = homeMode === "nft" || demo;
    const chog = demo ? S.demoChog : S.chog;
    const hint = demo
      ? (chog ? "Demo: ride " + chog.name + ". Every Chog NFT feature, no Chog needed." : "Try Chog NFT mode with 5 demo Chogs. No Chog needed. DEMO leaderboard.")
      : nft && S.ticketsOn
      ? (chog ? "Ride " + chog.name + ". " : "Ride a Chog you own. ") + ticketHint()
      : nft
      ? (chog ? "Ride " + chog.name + ". Abilities from its traits. Ranked." : "Ride a Chog you own. Abilities from its traits. Ranked.")
      : "Fly as Rookie, the practice pilot. No wallet. Not ranked.";
    $("modeHint").classList.toggle("warn", nft && !demo && S.ticketsOn && S.tickets === 0);
    const label = demo || (nft && !chog) ? "PICK CHOG" : "PLAY";   // demo: always choose from the 5 demo Chogs
    const lab = $("playBtn").querySelector(".play-label");
    if ($("modeHint").textContent !== hint) { $("modeHint").textContent = hint; if (animate) swapIn($("modeHint")); }
    if (lab.textContent !== label) { lab.textContent = label; if (animate) swapIn(lab); }
    $("playBtn").classList.toggle("pick", label !== "PLAY");
    $("bestLabel").textContent = nft && chog ? "BEST TOTAL" : "BEST";
    // The selected Chog's level; the chip opens its career
    const cr = nft && chog ? careerOf(chog) : null;
    if (nft && chog && !chog.demo && !cr) loadCareerInfo(chog.tokenId);
    $("bestLv").textContent = cr ? "LV " + cr.level : "";
    $("bestChip").classList.toggle("has-career", !!(nft && chog));
    // A clear Career button under the mode line (phones show no "CAREER" in the small chip)
    // With no Chog picked yet: Chog NFT opens the career lookup, Demo opens the demo Chogs (each has a Career button)
    const pill = $("careerPill");
    pill.style.display = "";
    pill.style.visibility = nft ? "" : "hidden";   // keeps its space in practice, so PLAY never moves between modes
    if (nft && chog) pill.innerHTML = (cr ? '<span class="chip-lv">LV ' + cr.level + "</span>" : "") + "<span>" + esc(cr && cr.title ? cr.title : chog.name) + "</span><b>CAREER &rsaquo;</b>";
    else if (nft) pill.innerHTML = "<span>Every Chog has a career</span><b>" + (demo ? "DEMO CAREERS" : "CHOG CAREERS") + " &rsaquo;</b>";
    $("bestValue").textContent = (nft && chog ? readNum(bestKey(chog)) : readNum(PRACTICE_BEST)).toLocaleString() + " m";
    $("walletChipText").textContent = S.account ? (S.username || short(S.account)) : "Connect wallet";
    $("walletDot").classList.toggle("on", !!S.account && S.chainId === cfg.collection.chainId);
    $("keyHint").textContent = "Press SPACE to " + (label === "PICK CHOG" ? "pick a Chog" : "play") + "  ·  F for full screen";
    renderTicketBtn();
    if (!animate) movePill(true);   // e.g. the home screen was hidden while the pill moved
    placeHero();
  }
  // Chog NFT mode with the pool live: your tickets and this week's pool, under the mode switch
  function ticketHint() {
    const pool = "Pool " + poolUsd(S.pool && S.pool.current, S.pool && S.pool.chogUsd);
    if (!authValid() || S.tickets == null) return pool + " this week · $" + cfg.tickets.priceUsd.toFixed(2) + " a ticket.";
    return S.tickets > 0 ? S.tickets + " ticket" + (S.tickets === 1 ? "" : "s") + " · " + pool + " · Ranked." : "No tickets · " + pool + " · Buy tickets to be ranked.";
  }
  // On tall screens, place the home screen rocket in the gap between PLAY and the bottom buttons
  function placeHero() {
    if (!game || innerWidth >= innerHeight) { game && game.setHeroScreenY(null); return; }
    const top = $("playBtn").getBoundingClientRect().bottom, bottom = document.querySelector(".home-bottom").getBoundingClientRect().top;
    game.setHeroScreenY(bottom > top ? ((top + bottom) / 2) / innerHeight : null);
  }

  function play() {
    if (homeMode === "practice") startPractice();
    else if (homeMode === "demo") openDemo();
    else if (S.chog) rideChog();
    else openNft();
  }
  // Best total distance on this device for a Chog (demo Chogs are kept apart from real runs)
  const bestKey = c => (c.demo ? "chogDashDemoBest:" : "chogDashNftBest:") + c.tokenId;
  // The Chog being flown: a demo Chog in demo mode, else the wallet's chosen Chog
  const activeChog = () => (S.mode === "demo" ? S.demoChog : S.mode === "nft" ? S.chog : null);

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
    const chog = activeChog();
    S.bankLives = S.mode === "demo" ? Demo.lives() : 0;   // Chog NFT mode gets its streak lives from the server's run session
    game.configure({ bestToBeat: chog ? readNum(bestKey(chog)) : readNum(PRACTICE_BEST), bankLives: S.bankLives });
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
    } else if (S.mode === "demo") {
      renderNftReady();
      requestDemoSession();
    }
    stopReveal();
    if (S.mode === "nft") loadQuests();
    else { S.quests = S.mode === "demo" ? Demo.view() : null; renderQuestStrip(); }
  }

  function onStart() {
    setFlying(true);
    showEndBar(false);
    S.autoStart = false;
    $("cardBtn").style.display = "none";
    S.lastRun = null;
    $("msg").style.display = "none";
    S.runCounter++;
    // The run's leaderboard session. On a phone the player often taps to fly before the server has answered;
    // then the run waits for that answer (activeWait) and submits with it at the end, instead of being lost.
    S.activeRunId = S.runId;
    S.activeWait = !S.runId && S.sessionWait && S.sessionWait.req === S.sessionReq ? S.sessionWait.promise : null;
    S.startedReq = S.sessionReq;
    S.runId = null;
    renderTicketBtn();
    // Tell the server the rocket took off: a Chog NFT run spends its ticket now (and the run time counts from here)
    if (S.mode === "nft" || S.mode === "demo") {
      const flying = runSession();
      S.activeFly = flying.then(id => (id ? apiCall("/run/fly", { runId: id }, S.auth && S.auth.token) : null)).then(r => {
        if (r && r.tickets != null) S.tickets = r.tickets;
        return r;
      }).catch(() => null);
    }
    stopReveal();
    renderQuestStrip();
    startLiveQuests();
  }

  // The run's session id: known at the start, or still on its way from the server (the run waits for it)
  function runSession() {
    return S.activeRunId ? Promise.resolve(S.activeRunId) : (S.activeWait || Promise.resolve(null));
  }

  function onEnd(result) {
    setFlying(false);
    clearInterval(liveTimer);
    $("questToast").classList.remove("show");
    rememberRun(result);
    const c = activeChog(), practice = !c;
    const key = practice ? PRACTICE_BEST : bestKey(c);
    const value = practice ? result.meters : result.score;
    const prevBest = readNum(key);
    writeNum(key, Math.max(prevBest, value));
    gameOver(result, c, value, prevBest);
    renderQuestStrip();
    const run = S.runCounter;
    const live = () => run === S.runCounter && game.state === "dead";
    if (practice) { goStatus(["Practice run: never on the leaderboard", ""]); return; }
    if (S.mode === "demo") {
      // Demo: quests, badges, the streak and streak lives use the same rules, kept on this device. Signed in,
      // the run is checked by the server and ranked on the separate DEMO leaderboard.
      const q = Demo.finish(result);
      if (result.meters > 0) {   // the demo Chog's career, kept on this device
        const out = Career.applyRun(demoCareer(c.tokenId), { meters: result.meters, total: result.score, at: Date.now(), pilot: S.username || null, ranked: false });
        saveDemoCareer(out.career);
        renderGoCareer(Object.assign(Career.progress(out.career.xp), { gained: out.gained, levelUp: out.levelUp, newTitles: out.newTitles }), c);
      }
      if (q.badges.length) revealBadges(q.badges);
      if (q.livesEarned) revealBadges([{ lives: q.livesEarned, day: q.streakDay }]);
      S.quests = Demo.view();
      goNotes(questLines(q));
      renderGoQuests();
      if (!S.activeRunId && !S.activeWait) { goStatus(["Demo run: not on the DEMO leaderboard (not signed in)", "warn"]); return; }
      goStatus(["Submitting to the DEMO leaderboard...", "wait"]);
      runSession()
        .then(runId => {
          if (!runId) throw new Error("this run was not registered with the DEMO leaderboard");
          return apiCall("/run/finish", { runId, meters: result.meters, durationMs: result.durationMs, laserUsed: result.laserUsed }, S.auth && S.auth.token);
        })
        .then(r => {
          if (!live()) return;
          if (r.status === "validated" && S.lastRun) { S.lastRun.rank = r.rank || null; S.lastRun.total = r.finalScore; }
          goStatus(r.status === "validated"
            ? ["DEMO leaderboard: total distance " + r.finalScore + " m" + (r.rank ? ", rank " + r.rank : ""), "good", r.rank]
            : ["Not validated: " + (r.reason || r.status), "warn"]);
        })
        .catch(e => { if (live()) goStatus(["Not submitted: " + e.message, "warn"]); });
      return;
    }
    if (!S.activeRunId && !S.activeWait) {
      goStatus(["Not submitted: " + (S.runStatus.kind === "warn" ? S.runStatus.text : "this run was not registered with the leaderboard"), "warn"]);
      return;
    }
    goStatus(["Submitting to the leaderboard...", "wait"]);
    runSession()
      .then(runId => {
        if (!runId) throw new Error("this run was not registered with the leaderboard");
        return apiCall("/run/finish", { runId, meters: result.meters, durationMs: result.durationMs, laserUsed: result.laserUsed,
          stardust: result.stardust || 0, powerups: result.powerups || 0, horns: result.horns || 0, nearMisses: result.nearMisses || 0,
          livesUsed: result.livesUsed || 0, bankLivesUsed: result.bankLivesUsed || 0 }, S.auth && S.auth.token);
      })
      .then(r => {
        if (!live()) return;
        if (r.status === "validated" && S.lastRun) { S.lastRun.rank = r.rank || null; S.lastRun.total = r.finalScore; }
        goStatus(r.status === "validated"
          ? ["This week: total distance " + r.finalScore + " m (x" + r.multiplier + ")" + (r.rank ? ", rank " + r.rank : ""), "good", r.rank]
          : r.status === "unranked"
            ? ["Not ranked: no ticket for this run. Buy tickets to compete for the weekly pool", "warn"]
            : ["Not validated: " + (r.reason || r.status), "warn"]);
        goNotes(questLines(r.quests));
        if (r.career) { S.careerInfo = { tokenId: c.tokenId, level: r.career.level, title: r.career.title }; renderGoCareer(r.career, c); }
        if (r.quests && r.quests.badges.length) revealBadges(r.quests.badges);
        if (r.quests && r.quests.livesEarned) revealBadges([{ lives: r.quests.livesEarned, day: r.quests.streakDay }]);
        if (r.status === "validated") loadQuests();
      })
      .catch(e => { if (live()) goStatus(["Not submitted: " + e.message, "warn"]); });
  }

  // ---------- Game over screen ----------
  // Like other runners: a beat after the crash, then GAME OVER, the total counting up, the best (or a NEW BEST
  // burst), the run's stats, where it ranks, today's quests, and a big PLAY AGAIN with Share, Ranks and Home.
  let goAnim = null;
  const ZONE_COLORS = { outer: "#4fa8ff", belt: "#d08a4e", drift: "#c58bff", deep: "#3fd0c9", milky: "#ffcf4d" };
  function gameOver(result, c, value, prevBest) {
    const z = T.zoneAt(result.meters), practice = !c, g = c && c.gameplay;
    const laser = g && g.abilities.find(a => a.id === "laserEyes");
    const newBest = value > prevBest && prevBest > 0;
    const tierColor = practice ? "var(--accent)" : ({ common: "#cfd6e3", uncommon: "#6ee7a8", rare: "#4fa8ff", epic: "#b6ff3a", legendary: "#ffcf4d" })[String(g.tier || "").toLowerCase()] || "var(--accent)";
    const el = $("gameOver");
    el.style.setProperty("--tc", newBest ? "#ffcf4d" : tierColor);   // the card glows in the tier colour, gold for a new best
    el.classList.toggle("best", newBest);
    $("goMode").textContent = practice ? "PRACTICE" : S.mode === "demo" ? "DEMO · " + c.name : c.name + " · " + (g.tier || "");
    $("goLabel").textContent = practice ? "DISTANCE" : "TOTAL DISTANCE";
    const wk = practice ? null : weekTrait(c);
    $("goFormula").textContent = practice ? "" : result.meters.toLocaleString() + " m flown x " + g.multiplier.toFixed(2) + " (Tier " + (g.tier || "unknown") + ")" +
      (wk && wk.has ? " x " + wk.bonus.toFixed(2) + " (" + wk.featured.label + ")" : "");
    renderGoCareer(null);
    $("goFace").style.display = c ? "" : "none";
    if (c) $("goFace").src = c.imageUrl;
    // Best: a NEW BEST burst, the first run, or how far short of it
    const bestBox = $("goBest");
    bestBox.className = "go-best" + (newBest ? " new" : "");
    bestBox.innerHTML = newBest
      ? '<div class="nb">NEW BEST!</div><div class="go-small">Previous best ' + prevBest.toLocaleString() + " m</div>"
      : prevBest <= 0
      ? '<div class="go-small">First run' + (practice ? "" : " with this Chog") + ": " + value.toLocaleString() + " m is the one to beat</div>"
      : '<div class="go-bestrow"><span>BEST</span><b>' + Math.max(prevBest, value).toLocaleString() + ' m</b></div><div class="go-bar"><i style="width:' +
        Math.min(100, Math.round((value / prevBest) * 100)) + '%"></i></div><div class="go-small">' + (value === prevBest ? "Equal to your best!" : (prevBest - value).toLocaleString() + " m short of your best") + "</div>";
    // Stats tiles
    const secs = Math.round((result.durationMs || 0) / 1000);
    const tiles = [
      ["TIME", Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0")],
      ["STARDUST", (result.stardust || 0).toLocaleString()],
      ["NEAR MISSES", (result.nearMisses || 0).toLocaleString()],
      ["ZONE", z.zone.name + (z.loop > 1 ? " · loop " + z.loop : ""), ZONE_COLORS[z.zone.id]],
    ].concat(laser ? [["LASER", (result.laserUsed || 0) + " / " + laser.charges]] : []);
    $("goStats").style.setProperty("--n", tiles.length);
    $("goStats").dataset.n = tiles.length;
    $("goStats").innerHTML = tiles.map(([k, v, col], i) => '<div class="go-tile' + (k === "ZONE" ? " zone" : "") + '" style="--i:' + i + (col ? ";--zc:" + col : "") + '"><span>' + k + "</span><b>" + esc(v) + "</b></div>").join("");
    $("goNotes").innerHTML = "";
    goStatus(["", ""]);
    renderGoQuests();
    // The total counts up
    cancelAnimationFrame(goAnim);
    const total = $("goTotal"), t0 = performance.now(), dur = Math.min(1400, 500 + value / 8);
    total.textContent = "0";
    total.parentNode.classList.remove("landed");
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      total.textContent = Math.round(value * e).toLocaleString();
      if (k < 1) goAnim = requestAnimationFrame(tick);
      else total.parentNode.classList.add("landed");   // a small pop when the count lands
    };
    $("msg").style.display = "none";
    clearTimeout(S.goTimer);
    el.classList.remove("show");
    S.goTimer = setTimeout(() => {   // a short beat to see the crash first
      if (game.state !== "dead") return;
      el.classList.add("show");
      document.body.classList.add("game-over");
      goAnim = requestAnimationFrame(tick);
    }, 550);
  }
  // [text, kind ("good" | "warn" | "wait" | ""), rank]
  function goStatus([text, kind, rank]) {
    const el = $("goRank");
    el.className = "go-rank" + (kind ? " " + kind : "") + (text ? "" : " empty");
    el.innerHTML = (rank ? '<span class="go-rk">#' + rank + "</span>" : "") + "<span>" + esc(text || "") + "</span>";
  }
  function goNotes(list) {
    $("goNotes").innerHTML = (list || []).map(l => '<div class="go-note">' + esc(Array.isArray(l) ? l[0] : l) + "</div>").join("");
  }
  // Today's quests on the game over card (Chog NFT and demo runs)
  function renderGoQuests() {
    const box = $("goQuests"), r = S.quests;
    if (!r || !(S.mode === "nft" || S.mode === "demo")) { box.innerHTML = ""; box.style.display = "none"; return; }
    box.style.display = "";
    box.innerHTML = '<div class="go-qh">TODAY\'S QUESTS <b>' + r.daily.filter(q => q.done).length + "/3</b></div>" + r.daily.map(q =>
      '<div class="go-q' + (q.done ? " done" : "") + '" style="--c:' + q.badge.color + '">' + badgeIcon(q.badge, q.done ? Math.max(0, q.badge.tier) : -1, "mini") +
      '<span class="go-qt">' + esc(q.title) + '</span><span class="go-qbar"><i style="width:' + (q.done ? 100 : Math.round((q.progress / q.target) * 100)) + '%"></i></span>' +
      '<span class="go-qp">' + (q.done ? "Done" : fmtProgress(q)) + "</span></div>").join("");
  }


  // ---------- Demo: 5 demo Chogs, Chog NFT mode without a wallet ----------
  function openDemo() {
    show("demoPanel");
    renderDemoAccount();
    const list = $("demoList");
    const mark = () => list.querySelectorAll(".demo-card").forEach(el => {
      el.classList.toggle("sel", !!S.demoChog && el.dataset.token === S.demoChog.tokenId);
      el.querySelector(".dlv").textContent = "Lv " + Career.levelFor(demoCareer(el.dataset.token).xp);   // levels change after runs
    });
    if (list.childElementCount) { mark(); return; }
    Demo.CHOGS.forEach(d => {
      const meta = d.metadata, gp = T.resolveGameplay(meta);
      const laser = gp.abilities.find(a => a.id === "laserEyes");
      const look = root.ChogLooks.rocketLook(gp.attributes, meta, null);
      const legendary = look.id.indexOf("legendary:") === 0;
      const wk = T.weeklyTraitFor(meta, thisWeek());
      const chips = (wk.has ? ['<span class="dchip week">Trait of the week ' + pctBonus(wk.bonus) + "</span>"] : [])
        .concat(laser ? ['<span class="dchip laser">Laser Eyes &middot; ' + esc(laser.fromValue) + "</span>"] : [])
        .concat(look.id !== "standard" ? ['<span class="dchip rocket">' + esc(legendary ? "One-of-one rocket" : look.name) + "</span>"] : [])
        .concat(look.trail ? ['<span class="dchip trail">' + esc(legendary ? look.trail.style.charAt(0).toUpperCase() + look.trail.style.slice(1) : look.trail.name) + " trail</span>"] : []);
      const card = document.createElement("button");
      card.className = "demo-card t-" + String(gp.tier || "").toLowerCase();
      card.dataset.token = d.tokenId;
      card.innerHTML = '<div class="dimg"><span class="dload">Loading art...</span></div><div class="dbody"><div class="dname">' + esc(meta.name) +
        '</div><div class="dtier">' + esc(gp.tier) + " &middot; x" + gp.multiplier.toFixed(2) + ' &middot; <span class="dlv"></span></div><div class="dchips">' + chips.join("") +
        '</div><div class="dblurb">' + esc(d.blurb) + '</div><div class="drow"><span class="dfly">FLY</span><span class="dcareer" role="button" tabindex="0">Career</span></div></div>';
      card.onclick = () => pickDemo(d, card);
      card.querySelector(".dcareer").onclick = e => { e.stopPropagation(); openCareer(d.tokenId, { demo: true }); };
      list.appendChild(card);
      card.querySelector(".dlv").textContent = "Lv " + Career.levelFor(demoCareer(d.tokenId).xp);
      Meta.loadImage(meta.image).then(art => {
        d._art = art;
        const img = document.createElement("img"); img.alt = ""; img.src = art.url;
        card.querySelector(".dimg").replaceChildren(img);
      }).catch(() => { card.querySelector(".dload").textContent = "Art not loaded"; });
    });
  }
  // Demo runs go on the DEMO leaderboard when signed in (any wallet, no Chog needed) with a pilot name
  function renderDemoAccount() {
    const box = $("demoAccount");
    const ok = authValid() && S.username;
    box.className = "demo-account" + (ok ? " ok" : "");
    box.innerHTML = ok
      ? "<span><b>" + esc(S.username) + "</b>: your demo runs go on the DEMO leaderboard.</span>"
      : "<span>Want your demo runs on the <b>DEMO leaderboard</b>? Connect any wallet (it doesn't need a Chog), sign in and pick a pilot name.</span>";
    const b = document.createElement("button");
    b.textContent = ok ? "See DEMO ranks" : authValid() ? "Pick a pilot name" : "Connect wallet";
    b.className = ok ? "ghost" : "";
    b.onclick = ok ? () => openLeaderboard("demo") : () => { S.nftReturn = "demoPanel"; openNft(); };
    box.appendChild(b);
  }

  async function pickDemo(d, card) {
    const st = $("demoStatus");
    st.className = "lb-status"; st.textContent = "Loading " + d.metadata.name + "...";
    try {
      const art = d._art || (d._art = await Meta.loadImage(d.metadata.image));
      S.demoChog = Object.assign(chogFromArt(d.tokenId, d.metadata, art), { demo: true });
      st.textContent = "";
      setHomeMode("demo");
      rideDemo();
    } catch (e) {
      st.className = "lb-status err";
      st.textContent = "Couldn't load this Chog's artwork from IPFS right now. Try again in a moment.";
    }
  }
  function rideDemo() {
    const c = S.demoChog;
    const laser = c.gameplay.abilities.find(a => a.id === "laserEyes");
    S.mode = "demo";
    game.configure({
      riderCanvas: c.riderCanvas, riderPoses: c.riderPoses, look: c.look, laserCharges: laser ? laser.charges : 0,
      multiplier: effMult(c), showScore: true,
      modeLabel: "DEMO · " + c.name + " · Tier " + (c.gameplay.tier || "unknown"),
    });
    $("modeBadge").className = "demo";
    $("riderCard").src = c.imageUrl;
    $("riderCard").style.display = "block";
    enterGame();
  }

  // ---------- Trait of the week and Chog careers ----------
  const Career = root.ChogCareer;
  const thisWeek = () => T.weekOf(Date.now());
  // This week's featured trait for a Chog: { has, bonus, value, featured }
  const weekTrait = c => (c && c.metadata ? T.weeklyTraitFor(c.metadata, thisWeek()) : null);
  // The run's multiplier: tier x the weekly bonus when the Chog has the trait (the server works it out the same way)
  const effMult = c => { const w = weekTrait(c); return T.effectiveMultiplier(c.gameplay.multiplier, w && w.has ? w.bonus : 1); };
  const pctBonus = b => "+" + Math.round((b - 1) * 100) + "%";
  function traitLine(c) {
    const w = weekTrait(c);
    if (!w) return "";
    return w.has ? ["Trait of the week: " + w.featured.label + " (" + pctBonus(w.bonus) + "). This Chog has it: total x" + effMult(c), "good"]
      : "Trait of the week: " + w.featured.label + " (" + pctBonus(w.featured.bonus) + "). Not on this Chog";
  }
  // Demo Chogs keep their careers on this device, with the same rules
  const DEMO_CAREER = "chogDashDemoCareer:";
  function demoCareer(id) { try { return JSON.parse(localStorage.getItem(DEMO_CAREER + id)) || Career.empty(id); } catch (e) { return Career.empty(id); } }
  function saveDemoCareer(c) { try { localStorage.setItem(DEMO_CAREER + c.tokenId, JSON.stringify(c)); } catch (e) {} }
  function clearDemoCareers() { try { Object.keys(localStorage).filter(k => k.indexOf(DEMO_CAREER) === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
  // A Chog's level and latest title, when known: { level, title }
  function careerOf(c) {
    if (!c) return null;
    if (c.demo) { const d = demoCareer(c.tokenId); return { level: Career.levelFor(d.xp), title: Career.topTitle(d) }; }
    return S.careerInfo && S.careerInfo.tokenId === c.tokenId ? S.careerInfo : null;
  }

  // A Chog's level from the server, for the home screen chip (once per Chog until a run updates it)
  async function loadCareerInfo(id) {
    if (S.careerLoading === id) return;
    S.careerLoading = id;
    try {
      const v = await apiCall("/career?token=" + encodeURIComponent(id));
      S.careerInfo = { tokenId: id, level: v.level, title: v.title };
      if ($("menuPanel").classList.contains("show")) refreshHome();
    } catch (e) { /* offline or unknown: the chip just shows no level */ }
  }

  // Game over: the Chog's level, the XP this run earned, a level-up and any new titles
  function renderGoCareer(info, c) {
    const box = $("goCareer");
    if (!info) { box.className = "go-career empty"; box.innerHTML = ""; return; }
    box.className = "go-career" + (info.levelUp ? " up" : "");
    box.innerHTML = '<div class="gc-row"><span class="gc-lv">LV<b>' + info.level + '</b></span><div class="gc-mid"><div class="gc-top"><b>' +
      (info.levelUp ? "LEVEL UP!" : "Chog level " + info.level) + "</b><span>+" + Number(info.gained || 0).toLocaleString() + ' XP</span></div><div class="go-bar gc-bar"><i style="width:' +
      info.pct + '%"></i></div></div><button class="ghost gc-btn">Career</button></div>' +
      (info.newTitles && info.newTitles.length ? '<div class="gc-titles">' + info.newTitles.map(t => '<span class="cr-chip on new">' + esc(t.label) + "</span>").join("") + "</div>" : "");
    box.querySelector(".gc-btn").onclick = () => openCareer(c.tokenId, { demo: !!c.demo, back: "game" });
  }

  // The chosen Chog in the picker: its level, latest title and a Career button
  async function loadChosenCareer(idStr, req) {
    try {
      const v = await apiCall("/career?token=" + encodeURIComponent(idStr));
      if (req !== S.selectReq) return;
      S.careerInfo = { tokenId: idStr, level: v.level, title: v.title };
      $("chosenCareer").innerHTML = '<span class="gc-lv">LV<b>' + v.level + "</b></span><span>" + (v.title ? "<b>" + esc(v.title) + "</b> · " : "") +
        (v.runs ? v.runs.toLocaleString() + " run" + (v.runs === 1 ? "" : "s") + " · " + v.flown.toLocaleString() + " m flown" : "No runs yet: its career starts with the first one") + "</span>";
      $("chosenCareerBtn").style.display = "";
    } catch (e) { /* the career is extra: the Chog can still be ridden */ }
  }

  // Leaderboard entries open their Chog's career (Chog NFT board; demo careers live on each player's device)
  function careerLink(el, e, demo) {
    if (demo || !e.tokenId) return;
    el.classList.add("linked");
    el.title = "See this Chog's career";
    el.onclick = () => openCareer(e.tokenId);
  }

  let careerReturn = null, careerShown = null;
  async function openCareer(tokenId, opts) {
    opts = opts || {};
    const id = String(tokenId);
    careerReturn = opts.back || ["lbPanel", "nftPanel", "demoPanel", "menuPanel"].find(p => $(p).classList.contains("show")) || "menuPanel";
    show("careerPanel");
    $("careerBody").innerHTML = "";
    $("careerFind").style.display = opts.demo ? "none" : "";
    $("careerFindId").value = tokenId == null ? "" : id;
    const st = $("careerStatus");
    if (tokenId == null) {   // the lookup: any Chog's career by token ID
      careerShown = null;
      $("careerSub").textContent = "CHOG GENESIS";
      $("careerShare").style.display = "none";
      st.className = "lb-status"; st.textContent = "Every Chog builds a career from its runs: level, titles, weekly honors and history. It stays with the NFT when it changes hands. Look up any Chog by its token ID, or tap a pilot on Ranks.";
      return;
    }
    careerShown = { id, demo: !!opts.demo };
    $("careerShare").style.display = opts.demo ? "none" : "";
    st.className = "lb-status"; st.textContent = "Loading this Chog's career...";
    try {
      let v;
      if (opts.demo) {
        const d = Demo.CHOGS.find(x => x.tokenId === id), gp = T.resolveGameplay(d.metadata), wk = T.weeklyTraitFor(d.metadata, thisWeek()), c = demoCareer(id);
        v = Object.assign(Career.view(c), { name: d.metadata.name, image: d.metadata.image, tier: gp.tier, multiplier: gp.multiplier, title: Career.topTitle(c), demo: true,
          weeklyTrait: { id: wk.featured.id, label: wk.featured.label, has: wk.has, bonus: wk.bonus, featuredBonus: wk.featured.bonus } });
      } else v = await apiCall("/career?token=" + encodeURIComponent(id));
      if (!careerShown || careerShown.id !== id) return;
      st.textContent = "";
      renderCareer(v);
    } catch (e) {
      st.className = "lb-status err"; st.textContent = "Couldn't load this Chog's career: " + e.message;
    }
  }
  function closeCareer() {
    const back = careerReturn; careerReturn = careerShown = null;
    if (back === "game") show(null); else show(back || "menuPanel");
  }
  function renderCareer(v) {
    $("careerSub").textContent = v.demo ? "DEMO CHOG · ON THIS DEVICE" : "CHOG GENESIS #" + v.tokenId;
    const body = $("careerBody");
    const when = ms => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const earned = v.titles.filter(t => t.earnedAt).length;
    const wt = v.weeklyTrait;
    body.innerHTML =
      '<div class="cr-head"><div class="cr-facebox"></div><div class="cr-id"><div class="cr-name">' + esc(v.name || "Chog #" + v.tokenId) + '</div><div class="cr-tier">' +
        esc((v.tier ? v.tier + (v.multiplier ? " x" + Number(v.multiplier).toFixed(2) : "") + " · " : "") + "token " + v.tokenId) + '</div><div class="cr-best">' +
        (v.title ? '<span class="cr-chip on">' + esc(v.title) + "</span>" : '<span class="cr-muted">No titles yet</span>') + "</div></div></div>" +
      '<div class="cr-level"><div class="cr-lvtop"><span class="gc-lv big">LV<b>' + v.level + "</b></span><div><b>" + (v.nextAt ? "Level " + v.level : "Max level") + "</b><span>" +
        v.xp.toLocaleString() + (v.nextAt ? " / " + v.nextAt.toLocaleString() + " XP" : " XP") + '</span></div></div><div class="go-bar"><i style="width:' + v.pct + '%"></i></div>' +
        '<div class="cr-muted">XP: 1 per 20 m flown, +50 for every zone reached past the first, +10 per run.</div></div>' +
      (wt ? '<div class="cr-trait' + (wt.has ? " has" : "") + '">Trait of the week: <b>' + esc(wt.label) + "</b> · " +
        (wt.has ? "this Chog has it: " + pctBonus(wt.bonus) + " total distance this week" : "not on this Chog this week") + "</div>" : "") +
      '<div class="cr-stats">' + [["RUNS", v.runs.toLocaleString()], ["FLOWN", v.flown.toLocaleString() + " m"], ["BEST TOTAL", v.bestTotal.toLocaleString() + " m"],
        ["FURTHEST", v.furthestZoneName || "-"], ["PILOTS", String(v.pilots)]].map(([k, x]) => '<div class="go-tile' + (k === "FURTHEST" ? " zone" : "") + '"><span>' + k + "</span><b>" + esc(x) + "</b></div>").join("") + "</div>" +
      '<h3 class="cr-h">TITLES <span>' + earned + " / " + v.titles.length + '</span></h3><div class="cr-titles">' +
        v.titles.map(t => '<span class="cr-chip' + (t.earnedAt ? " on" : "") + '" title="' + esc(t.desc) + '">' + esc(t.label) + "</span>").join("") + "</div>" +
      (v.honors.length ? '<h3 class="cr-h">WEEKLY HONORS</h3><div class="cr-list">' + v.honors.map(h =>
        '<div class="cr-row"><span>Week of ' + when((h.week * 7 - 3) * 864e5) + "</span><b>#" + h.rank + "</b></div>").join("") + "</div>" : "") +
      '<h3 class="cr-h">RECENT RUNS</h3><div class="cr-list">' + (v.recent.length ? v.recent.map(r =>
        '<div class="cr-row"><span>' + when(r.at) + (r.pilot ? " · " + esc(r.pilot) : "") + (r.ranked ? "" : ' <i class="cr-muted">unranked</i>') + "</span><b>" +
        r.total.toLocaleString() + ' m</b><span class="cr-muted">' + r.meters.toLocaleString() + " m flown · zone " + r.zone + "</span></div>").join("")
        : '<div class="cr-muted">No runs yet. The first run starts this Chog\'s career.</div>') + "</div>" +
      '<p class="lb-rule">' + (v.demo ? "A demo Chog's career is kept on this device only. Real Chogs keep theirs on the server, and anyone can see them."
        : "A career belongs to the Chog itself, not the wallet: when the NFT changes hands, its level, titles and history go with it.") + "</p>";
    body.querySelector(".cr-facebox").appendChild(chogImg(v.image, "cr-face"));
  }

  // ---------- Run card ----------
  // Built from the finished run, for practice and Chog NFT runs alike. Checked against the stored best
  // before onEnd updates it, so a record run gets the NEW BEST badge.
  function rememberRun(result) {
    const c = activeChog(), nft = !!c, demo = S.mode === "demo";
    const z = T.zoneAt(result.meters);
    const prevBest = nft ? readNum(bestKey(c)) : readNum(PRACTICE_BEST);
    S.lastRun = {
      practice: !nft, demo,
      portrait: nft ? c.img : Art.rookieCanvas(),
      username: demo ? "Demo pilot" : S.username || (nft ? short(S.account) : "Practice pilot"),
      chogName: nft ? c.name : null,
      tier: nft ? c.gameplay.tier : null,
      multiplier: nft ? effMult(c) : 1,
      weekTrait: nft && weekTrait(c) && weekTrait(c).has ? weekTrait(c).featured.label : null,
      level: nft ? (careerOf(c) || {}).level || null : null,
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
    if (!on) { clearTimeout(S.goTimer); cancelAnimationFrame(goAnim); $("gameOver").classList.remove("show"); document.body.classList.remove("game-over"); }
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
    if (S.mode === "nft" || S.mode === "demo") {
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
      : r.demo ? "I flew " + r.total.toLocaleString() + " m in the Chog Dash demo riding " + r.chogName + (r.rank ? " and I'm #" + r.rank + " on the demo leaderboard" : "")
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
    const c = activeChog(), g = c.gameplay, demo = S.mode === "demo";
    const laser = g.abilities.find(a => a.id === "laserEyes");
    const lv = careerOf(c);
    setMsg(demo ? "DEMO MODE" : "CHOG NFT MODE", [
      c.name + " (token " + c.tokenId + ")" + (lv ? " · Level " + lv.level + (lv.title ? " · " + lv.title : "") : ""),
      "Tier " + (g.tier || "unknown") + ": distance multiplier x" + g.multiplier.toFixed(2),
      traitLine(c),
      laser ? "Laser Eyes: " + laser.charges + " charges this run" : "No ability from this Chog's traits",
      lookLines(c.look)[0],
      S.bankLives ? ["Streak lives: " + S.bankLives + " banked. Used after your Stardust lives run out", "good"] : "",
      S.runStatus.text ? [S.runStatus.text, S.runStatus.kind] : "",
      controlsText(!!laser),
      portraitTip(),
      startText(),
    ]);
    renderTicketBtn();
  }

  // Demo: a server run session puts the run on the DEMO leaderboard (signed in, any wallet, with a pilot name)
  async function requestDemoSession() {
    S.runId = null;
    const req = ++S.sessionReq;
    if (!authValid() || !S.username) {
      S.runStatus = { text: "Demo run: not on the DEMO leaderboard. Connect any wallet and pick a pilot name to get ranked", kind: "warn" };
      renderNftReady();
      autoStartIfWaiting();
      return;
    }
    S.runStatus = { text: "Checking the DEMO leaderboard...", kind: "" };
    renderNftReady();
    const call = apiCall("/run/start", { tokenId: S.demoChog.tokenId, demo: true }, S.auth.token);
    S.sessionWait = { req, promise: call.then(r => r.runId, () => null) };
    try {
      const r = await call;
      if (req !== S.sessionReq) return;
      if (S.startedReq !== req) S.runId = r.runId;   // (already flying: that run takes this session, see onStart)
      S.runStatus = { text: "Demo run for the DEMO leaderboard as " + S.username + " (server-checked, Tier " + r.tier + " x" + r.multiplier + ")", kind: "good" };
    } catch (e) {
      if (req !== S.sessionReq) return;
      if (e.status === 401) S.auth = null;
      S.runStatus = { text: "Demo run: not on the DEMO leaderboard (" + e.message + ")", kind: "warn" };
    }
    if (game.state === "ready") renderNftReady();
    autoStartIfWaiting();
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
    const call = apiCall("/run/start", { tokenId: S.chog.tokenId }, S.auth.token);
    S.sessionWait = { req, promise: call.then(r => r.runId, () => null) };
    try {
      const r = await call;
      if (req !== S.sessionReq) return;
      if (S.startedReq !== req) S.runId = r.runId;   // (already flying: that run takes this session, see onStart)
      S.ticketsOn = !!r.ticketsOn; S.tickets = r.tickets;
      if (r.career) S.careerInfo = { tokenId: S.chog.tokenId, level: r.career.level, title: r.career.title };
      S.runStatus = !S.ticketsOn
        ? { text: "Eligible: this run will be submitted (server-verified Tier " + r.tier + ", x" + r.multiplier + ")", kind: "good" }
        : S.tickets > 0
          ? { text: "Ranked run: uses 1 of your " + S.tickets + " ticket" + (S.tickets === 1 ? "" : "s") + " when you take off (Tier " + r.tier + ", x" + r.multiplier + ")", kind: "good" }
          : { text: "No ticket: this run won't be ranked. Buy tickets to compete for this week's prize pool", kind: "warn" };
      if (S.ticketsOn) loadPool();
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

  // Wallet picker, laid out like other games' and dapps' connect dialogs: one row per wallet with its logo, and
  // Installed / Last used / Connected, or Get (not installed) / Open app (on a phone, opens Chog Dash in the wallet app)
  const LAST_WALLET = "chogDashLastWallet";
  function renderWallets() {
    const box = $("walletButtons");
    box.innerHTML = "";
    const st = $("walletStatus");
    if (S.account) { afterConnect(); }
    if (location.protocol === "file:") {
      setStatus(st, "Wallets can't connect to a page opened as a file. Run Chog Dash from a web server (see README), or use practice mode.", "err");
      return;
    }
    let last = null;
    try { last = localStorage.getItem(LAST_WALLET); } catch (e) {}
    const phone = matchMedia("(pointer: coarse)").matches;
    const rank = w => (w.provider ? 2 : 0) + (w.provider && w.id === last ? 1 : 0);
    const wallets = Chain.listWallets().sort((a, b) => rank(b) - rank(a));
    wallets.forEach(w => {
      const connected = !!S.account && !!w.provider && w.provider === S.provider;
      const useApp = !w.provider && phone && w.app;
      const tag = connected ? ["Connected", "on"] : w.provider ? (w.id === last ? ["Last used", "ok"] : ["Installed", "ok"]) : useApp ? ["Open app", ""] : ["Get", ""];
      const sub = connected ? short(S.account) : w.provider ? "Detected in this browser" : useApp ? "Opens in the app" : "Not installed";
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wl-row" + (w.provider ? "" : " missing") + (connected ? " on" : "");
      b.dataset.wallet = w.id;
      b.innerHTML = '<img class="wl-ic" alt="" src="' + w.icon + '"><span class="wl-txt"><b>' + esc(w.name) + "</b><small>" + esc(sub) +
        '</small></span><span class="wl-tag ' + tag[1] + '">' + tag[0] + "</span>";
      b.onclick = () => {
        if (w.provider) connectWallet(w.provider, w.id);
        else if (useApp) location.href = w.app(location.href);
        else window.open(w.get, "_blank", "noopener");
      };
      box.appendChild(b);
    });
    if (S.account) return;
    if (!wallets.some(w => w.provider)) {
      setStatus(st, "None of these wallets is in this browser yet. Pick one to install it, then refresh this page." +
        (phone ? " On a phone, Open app loads Chog Dash inside the wallet's own browser." : "") + " You can still play practice and demo mode.");
    } else setStatus(st, "Pick your wallet. You'll be asked to approve the connection.");
  }

  async function connectWallet(provider, id) {
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
      if (id) try { localStorage.setItem(LAST_WALLET, id); } catch (e) {}
      renderWallets();
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
    claimPending();
    loadPool();
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
        setStatus(st, "This wallet holds no Chog Genesis NFTs. You can still play practice mode, or the DEMO tab with 5 demo Chogs (signed in, your demo runs go on the DEMO leaderboard).");
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
      const wk = T.weeklyTraitFor(m, thisWeek());
      if (wk.has) b.insertAdjacentHTML("beforeend", '<span class="tok-week" title="Trait of the week: ' + esc(wk.featured.label) + '">' + pctBonus(wk.bonus) + " this week</span>");
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
    $("chosenCareer").innerHTML = ""; $("chosenCareerBtn").style.display = "none";
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
    const wk = T.weeklyTraitFor(meta, thisWeek());
    loadChosenCareer(idStr, req);
    const lines = [
      "Owned by this wallet (checked on-chain).",
      "Tier: " + (gp.tier || "missing") + " -> distance multiplier x" + gp.multiplier.toFixed(2) + (gp.tierStatus === "mapped" ? "" : " (default)"),
      "Trait of the week: " + wk.featured.label + (wk.has ? " (this Chog has it: " + pctBonus(wk.bonus) + " total distance this week)" : " (not on this Chog)"),
      laser ? "Ability: Laser Eyes, " + laser.charges + " charges per run (from " + laser.fromTrait + ": " + laser.fromValue + ")"
        : "Ability: none. This Chog's Eyes trait has no ability mapped.",
    ].concat(gp.problems.map(p => "Metadata problem: " + p), gp.notes.map(n => "Note: " + n));
    setStatus(info, lines.join("\n") + "\nLoading artwork...");

    let art;
    try {
      art = await Meta.loadImage(meta.image);
      const chog = chogFromArt(idStr, meta, art);   // throws if the image can't be used by the game
      if (stale()) return;
      $("chosenImg").src = art.url;
      S.chog = chog;
      setStatus(info, lines.concat(lookLines(S.chog.look)).join("\n"));
      $("rideBtn").disabled = false;
    } catch (e) {
      if (!stale()) setStatus(info, lines.join("\n") + "\nCouldn't load this Chog's artwork, so it can't be ridden right now. Try again in a moment.", "err");
    }
  }

  // Everything the game needs to fly a Chog, from its metadata and loaded artwork
  function chogFromArt(idStr, meta, art) {
    const gp = T.resolveGameplay(meta);
    const name = typeof meta.name === "string" && meta.name.trim() ? meta.name : "Token " + idStr;
    const canvas = Art.nftRiderCanvas(art.img);
    canvas.getContext("2d").getImageData(0, 0, 1, 1);   // throws if the image can't be used by the game
    // In flight the rider faces where the rocket goes, so the camera sees a back view made from this
    // Chog's own traits and colours (see Art.chogBackCanvas). The portrait is shown in the HUD.
    const riderPoses = {
      side: Art.chogBackCanvas(art.img, gp.attributes, "threeQuarter", meta),
      back: Art.chogBackCanvas(art.img, gp.attributes, "back", meta),
    };
    // Rocket paint, glow and aura trail from the traits (looks only, see js/looks.js)
    const look = root.ChogLooks.rocketLook(gp.attributes, meta, Art.samplePalette(art.img).bg);
    return { tokenId: idStr, name, metadata: meta, gameplay: gp, imageUrl: art.url, img: art.img, riderCanvas: canvas, riderPoses, look };
  }

  function lookLines(look) {
    return ["Rocket: " + look.name + (look.trail ? ". Aura trail: " + look.trail.name : ". No aura trail")];
  }

  async function rideChog(opts) {
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
    // No tickets left: ask first (buy, or fly this run unranked) instead of the player finding out on the ready screen
    if (S.ticketsOn && authValid() && S.tickets === 0 && !(opts && opts.unranked)) { openNoTicket(); return; }

    const laser = c.gameplay.abilities.find(a => a.id === "laserEyes");
    S.mode = "nft";
    game.configure({
      riderCanvas: c.riderCanvas, riderPoses: c.riderPoses, look: c.look, laserCharges: laser ? laser.charges : 0,
      multiplier: effMult(c), showScore: true,
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
    const lv = e.level ? '<span class="lb-lv" title="Chog level">LV ' + e.level + "</span>" : "";
    const tierMult = Number(e.tierMultiplier || e.multiplier);
    return '<div class="who"><span class="nm">' + esc(e.username || short(e.wallet)) + "</span>" + pin + badges + '</div><div class="chog">' + lv +
      esc((e.name || "Token " + e.tokenId) + (e.tier ? " · " + e.tier + " x" + tierMult.toFixed(2) : "") + (e.traitBonus ? " · " + (e.weeklyTrait || "Trait") + " " + pctBonus(e.traitBonus) : "")) + "</div>";
  }

  // Two real leaderboards: Chog NFT runs, and demo runs (the 5 demo Chogs, any signed-in wallet)
  let lbBoard = "nft", lbWeek = null;
  // prizes: wallet -> label shown on the entry (this week: each rank's share; a finished week: what it pays)
  function renderBoard(r, prizes) {
    const prize = e => (prizes && prizes[e.rank] ? '<div class="prize">' + esc(prizes[e.rank]) + "</div>" : "");
    const podium = $("lbPodium"), list = $("lbList"), mine = S.auth && S.auth.account, demo = lbBoard === "demo";
    podium.innerHTML = ""; list.innerHTML = "";
    if (!r.entries.length) {
      list.innerHTML = '<div class="lb-empty"><div class="t">' + (demo ? "No demo pilots yet" : r.current === false ? "Nobody flew that week" : "No pilots yet this week") + "</div><p>" +
        (demo ? "Fly a demo Chog, signed in with any wallet, and take the top spot." : "Fly a Chog you own and take the top spot.") + "</p></div>";
      const b = document.createElement("button");
      b.textContent = demo ? "Fly a demo Chog" : "Fly a Chog";
      b.onclick = () => { if (demo) { setHomeMode("demo"); openDemo(); } else { setHomeMode("nft"); openNft(); } };
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
      d.insertAdjacentHTML("beforeend", entryNames(e) + '<div class="big">' + fmtM(e.totalMeters) + "</div>" + prize(e));
      careerLink(d, e, demo);
      podium.appendChild(d);
    });
    r.entries.slice(3).forEach(e => {
      const d = document.createElement("div");
      d.className = "lb-row lb-entry" + (mine && e.wallet === mine ? " mine" : "");
      d.innerHTML = '<div class="rk">' + e.rank + "</div>";
      d.appendChild(chogImg(e.image, "face"));
      d.insertAdjacentHTML("beforeend", '<div class="names">' + entryNames(e) + "</div>" + prize(e) + '<div class="big">' + fmtM(e.totalMeters) + "</div>");
      careerLink(d, e, demo);
      list.appendChild(d);
    });
  }

  function renderMe(me) {
    const box = $("lbMe"), demo = lbBoard === "demo";
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
      (demo ? (signedIn ? "Not ranked yet. Finish a demo run to get on the DEMO board." : "Connect any wallet (no Chog needed) and pick a pilot name to get on the DEMO board.")
        : signedIn ? (S.ticketsOn ? "Not ranked this week. Fly a ticketed Chog NFT run to get on the board." : "Not ranked yet. Finish a Chog NFT run to get on the board.") : "Connect a wallet in Chog NFT mode to see your rank.") + "</div></div>";
    const b = document.createElement("button");
    b.textContent = signedIn ? "Fly" : "Connect";
    b.onclick = demo
      ? () => { setHomeMode("demo"); if (signedIn) openDemo(); else { S.nftReturn = "demoPanel"; openNft(); } }
      : () => { setHomeMode("nft"); signedIn && S.chog ? (show("menuPanel"), play()) : openNft(); };
    bar.appendChild(b);
  }

  // board: "nft" or "demo"; by default the one that matches the mode you're in. week: a past week of the Chog NFT board.
  const weekLabel = ms => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  async function openLeaderboard(board, week) {
    lbBoard = board || (S.mode === "demo" || (!S.mode && homeMode === "demo") ? "demo" : "nft");
    const demo = lbBoard === "demo";
    if (demo || week == null) lbWeek = null;
    show("lbPanel");
    $("lbTabNft").classList.toggle("on", !demo);
    $("lbTabDemo").classList.toggle("on", demo);
    $("lbPanel").classList.toggle("demo-board", demo);
    $("lbWeek").style.display = demo ? "none" : "";
    $("lbSub").textContent = demo ? "ALL TIME · DEMO RUNS" : "WEEKLY · CHOG NFT RUNS";
    $("lbRule").textContent = demo
      ? "The DEMO leaderboard: runs with the 5 demo Chogs by any signed-in wallet, checked by the server like Chog NFT runs (run time, distance and Laser Eyes limits). Total distance = distance flown x the demo Chog's tier. Separate from the Chog NFT leaderboard."
      : "Weekly: resets every Monday 00:00 UTC. Total distance = distance flown x the Chog's tier multiplier (" + pctBonus(cfg.weeklyTrait.bonus) + " more for Chogs with the trait of the week); each player's best ticketed run of the week counts. The top 10 share the week's prize pool (" + cfg.tickets.split.join("/") + "%); shares nobody earns roll over. Practice and demo runs never appear here.";
    $("lbRefresh").onclick = () => openLeaderboard(lbBoard, lbBoard === "nft" ? lbWeek : null);
    const st = $("lbStatus");
    $("lbPodium").innerHTML = "";
    $("lbList").innerHTML = '<div class="lb-row skeleton"></div>'.repeat(4);
    st.textContent = ""; st.className = "lb-status";
    renderMe(null);
    const want = lbBoard;
    try {
      const tok = authValid() ? S.auth.token : null;
      const r = await apiCall(demo ? "/demo-leaderboard" : "/leaderboard" + (week != null ? "?week=" + week : ""), null, tok);
      if (want !== lbBoard) return;   // switched tab meanwhile
      let prizes = null;
      if (!demo) {
        lbWeek = r.week;
        $("lbWeekLabel").textContent = r.current ? "THIS WEEK" : "WEEK OF " + weekLabel(r.startsAt).toUpperCase();
        const tw = T.weeklyTrait(r.week);
        $("lbTrait").textContent = (r.current ? "Trait of the week: " : "Trait that week: ") + tw.label + " " + pctBonus(tw.bonus);
        $("lbNext").style.visibility = r.current ? "hidden" : "visible";
        $("lbWeekInfo").textContent = "";
        // The prize: this week's pool and each rank's share, or what a finished week pays
        const extra = r.current ? loadPool() : apiCall("/pool/results?week=" + r.week, null, tok).catch(() => null);
        extra.then(x => {
          if (want !== lbBoard || lbWeek !== r.week || !x) return;
          if (r.current) {
            if (!x.enabled) { $("lbWeekInfo").textContent = "Resets in " + countdown(r.endsAt - Date.now()); return; }
            $("lbWeekInfo").textContent = "Pool " + poolUsd(x.current, x.chogUsd) + " · resets in " + countdown(r.endsAt - Date.now());
            const pz = {}; cfg.tickets.split.forEach((pc, i) => { pz[i + 1] = pc + "%"; });
            renderBoard(r, pz);
          } else {
            $("lbWeekInfo").textContent = x.paid ? "Paid out" : x.available != null ? "Pool " + poolUsd(x.available, S.pool && S.pool.chogUsd) + (x.payable ? " · ready to pay" : " · results under review") : "";
            const pz = {}; x.winners.forEach(w => { if (w.amount) pz[w.rank] = poolUsd(w.amount, S.pool && S.pool.chogUsd); });
            renderBoard(r, pz);
          }
        });
      }
      renderBoard(r, prizes);
      renderMe(r.me);
    } catch (e) {
      if (want !== lbBoard) return;
      $("lbList").innerHTML = "";
      st.className = "lb-status err";
      st.textContent = e.offline ? "The leaderboard server isn't reachable from here. It runs on the deployed site (see README)." : e.message;
    }
  }

  // ---------- Tickets and the weekly prize pool (Chog NFT mode) ----------
  // One ticket = one ranked Chog NFT run. The player's wallet pays $CHOG into the pool contract (js/tickets.js);
  // the server credits the tickets after reading the payment on-chain. A ticket is used when the rocket takes off.
  const PENDING_KEY = "chogDashTicketTx";
  const chogText = wei => (wei == null ? "-" : TKT.format(wei) + " CHOG");
  // The pool in dollars at today's $CHOG price (in $CHOG when there's no price)
  const poolUsd = (wei, usd) => (wei == null ? "-" : !usd ? chogText(wei) : "$" + (Number(BigInt(wei) / 10n ** 15n) / 1000 * usd).toFixed(2));
  function countdown(ms) {
    const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d ? d + "d " + h + "h" : h ? h + "h " + (m % 60) + "m" : (m % 60) + "m";
  }
  async function loadPool() {
    try { S.pool = await apiCall("/pool", null, authValid() ? S.auth.token : null); }
    catch (e) { return S.pool; }
    S.ticketsOn = !!S.pool.enabled;
    if (S.pool.me) S.tickets = S.pool.me.tickets;
    if ($("menuPanel").classList.contains("show")) refreshHome(); else renderTicketBtn();
    if ($("ticketPanel").classList.contains("show")) renderTicketPanel();
    return S.pool;
  }
  // The Tickets button on the home screen (Chog NFT mode, once the pool contract is live), with your ticket count
  function renderTicketBtn() {
    $("ticketBtn").classList.toggle("hidden", !S.ticketsOn || homeMode !== "nft");
    $("ticketBtnCount").textContent = S.tickets ? S.tickets : "";
  }

  function openTickets() {
    if (!authValid()) { S.nftReturn = null; openNft(); return; }
    S.tkReturn = ["lbPanel", "menuPanel", "nftPanel"].find(id => $(id).classList.contains("show")) || null;
    show("ticketPanel");
    setStatus($("tkStatus"), "");
    $("tkSteps").className = "tk-steps";
    renderTicketPanel();
    loadPool();
    if (S.provider && S.account) TKT.chogBalance(S.provider, S.account).then(b => { S.chogBalance = b; renderTicketPanel(); }).catch(() => {});
  }
  // The "no tickets" prompt before a Chog NFT run
  function openNoTicket() {
    const p = S.pool || {};
    $("ntPool").textContent = poolUsd(p.current, p.chogUsd);
    $("ntPrice").textContent = "$" + cfg.tickets.priceUsd.toFixed(2);
    $("noTicket").classList.add("show");
    $("ntBuy").focus();
  }
  function closeNoTicket() { $("noTicket").classList.remove("show"); }
  function closeTickets() {
    const back = S.tkReturn; S.tkReturn = null;
    if (back) { show(back); return; }
    show(null);   // back to the ready screen
    if (game.state === "ready" && S.mode === "nft") { requestRunSession(); renderNftReady(); }
  }
  function setTicketCount(n) { S.tkCount = Math.max(1, Math.min(cfg.tickets.maxPerBuy, n || 1)); renderTicketPanel(); }
  function renderTicketPanel() {
    const p = S.pool || {}, n = S.tkCount;
    $("tkPool").textContent = poolUsd(p.current, p.chogUsd);
    $("tkPoolUsd").textContent = p.chogUsd && p.current != null ? chogText(p.current) : "";
    $("tkReset").textContent = p.weekEndsAt ? countdown(p.weekEndsAt - Date.now()) : "-";
    $("tkHave").textContent = S.tickets == null ? "-" : S.tickets;
    $("tkCount").textContent = n;
    document.querySelectorAll(".tk-quick button").forEach(b => b.classList.toggle("on", Number(b.dataset.n) === n));
    const per = p.perTicket ? BigInt(p.perTicket) : null;
    $("tkPrice").textContent = per ? "1 ticket = " + chogText(per) + " ($" + cfg.tickets.priceUsd.toFixed(2) + " at $" + Number(p.chogUsd).toPrecision(3) + " per CHOG)" : "Price loading...";
    $("tkTotal").textContent = per ? chogText(per * BigInt(n)) + " (about $" + (cfg.tickets.priceUsd * n).toFixed(2) + ")" : "-";
    const short = per && S.chogBalance != null && S.chogBalance < per * BigInt(n);
    $("tkBal").textContent = S.chogBalance != null ? "Your wallet: " + chogText(S.chogBalance) + (short ? ". Not enough for " + n + " ticket" + (n === 1 ? "" : "s") : "") : "";
    $("tkBal").className = "tk-bal" + (short ? " warn" : "");
    $("tkBuyBtn").textContent = "Buy " + n + " ticket" + (n === 1 ? "" : "s");
    $("tkBuyBtn").disabled = !p.enabled || !!S.tkBusy;
    $("tkContract").innerHTML = p.address
      ? 'Pool contract: <a target="_blank" rel="noopener" href="' + cfg.collection.explorerUrls[0] + "/address/" + p.address + '">' + short2(p.address) + "</a> on Monad. Anyone can check every purchase and payout."
      : "Tickets aren't on sale yet: the pool contract hasn't been set up.";
  }
  const short2 = a => a.slice(0, 6) + "..." + a.slice(-4);
  function tkStep(name, state) {
    const li = document.querySelector('#tkSteps li[data-s="' + name + '"]');
    if (li) li.className = state || "";
    $("tkSteps").className = "tk-steps on";
  }

  async function buyTickets(n) {
    const st = $("tkStatus");
    if (S.tkBusy) return;
    if (!authValid() || !S.provider || !S.account) { setStatus(st, "Connect your wallet and sign in first (Chog NFT mode).", "err"); return; }
    if (S.chainId !== cfg.collection.chainId) {
      try { await Chain.switchToMonad(S.provider); S.chainId = cfg.collection.chainId; }
      catch (e) { setStatus(st, "Switch your wallet to " + cfg.collection.chainName + " to buy tickets.", "err"); return; }
    }
    S.tkBusy = true; renderTicketPanel();
    document.querySelectorAll("#tkSteps li").forEach(li => { li.className = ""; });
    const fail = (msg, stepName) => { if (stepName) tkStep(stepName, "bad"); setStatus(st, msg, "err"); };
    let step = "quote";
    try {
      tkStep("quote", "doing"); setStatus(st, "Checking the price...");
      const q = await apiCall("/tickets/quote", { count: n }, S.auth.token);
      const amount = BigInt(q.amount);
      const bal = await TKT.chogBalance(S.provider, S.account);
      S.chogBalance = bal;
      if (bal < amount) { fail("You need " + chogText(amount) + " but this wallet has " + chogText(bal) + ". Get $CHOG on nad.fun, then try again.", "quote"); return; }
      tkStep("quote", "done");
      step = "approve";
      if ((await TKT.allowance(S.provider, S.account, q.pool)) < amount) {
        tkStep("approve", "doing"); setStatus(st, "Approve " + chogText(amount) + " for the pool in your wallet...");
        const ah = await TKT.approve(S.provider, S.account, q.pool, amount);
        setStatus(st, "Waiting for the approval to confirm...");
        await TKT.wait(S.provider, ah);
      }
      tkStep("approve", "done");
      step = "pay";
      tkStep("pay", "doing"); setStatus(st, "Confirm the payment of " + chogText(amount) + " in your wallet...");
      const hash = await TKT.buy(S.provider, S.account, q.pool, amount, q.ref);
      savePending(hash);
      setStatus(st, "Payment sent. Waiting for it to confirm on Monad...");
      await TKT.wait(S.provider, hash);
      tkStep("pay", "done");
      step = "claim";
      tkStep("claim", "doing"); setStatus(st, "Adding your tickets...");
      const c = await claimTx(hash);
      tkStep("claim", "done");
      S.tickets = c.tickets;
      setStatus(st, "Done: " + n + " ticket" + (n === 1 ? "" : "s") + " added. You have " + c.tickets + ". Good luck this week!", "ok");
      sfx("quest");
      loadPool();
      TKT.chogBalance(S.provider, S.account).then(b => { S.chogBalance = b; renderTicketPanel(); }).catch(() => {});
    } catch (e) {
      const rejected = e && (e.code === 4001 || /rejected|denied/i.test(e.message || ""));
      fail(rejected ? "Cancelled in your wallet. Nothing was paid." : (step === "claim" ? "Paid, but the tickets couldn't be added yet (" + e.message + "). They'll be added automatically next time you sign in." : e.message || String(e)), step);
    } finally {
      S.tkBusy = false; renderTicketPanel();
    }
  }
  // A payment waiting to be credited (kept on this device, so a closed tab or lost connection doesn't lose tickets)
  function pendingList() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (e) { return []; } }
  function savePending(hash) {
    const l = pendingList().filter(x => x.hash !== hash); l.push({ hash, wallet: S.account, at: Date.now() });
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(l.slice(-20))); } catch (e) {}
  }
  function dropPending(hash) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(pendingList().filter(x => x.hash !== hash))); } catch (e) {} }
  async function claimTx(hash) {
    for (let i = 0; i < 20; i++) {
      const r = await apiCall("/tickets/claim", { txHash: hash }, S.auth.token);
      if (r.status === "credited") { dropPending(hash); return r; }
      await new Promise(res => setTimeout(res, 2500));
    }
    throw new Error("the payment isn't visible on-chain yet");
  }
  async function claimPending() {
    if (!authValid()) return;
    for (const p of pendingList().filter(x => x.wallet === S.account)) {
      try {
        const r = await apiCall("/tickets/claim", { txHash: p.hash }, S.auth.token);
        if (r.status === "credited") { dropPending(p.hash); S.tickets = r.tickets; renderTicketBtn(); }
      } catch (e) { if (e.status === 400) dropPending(p.hash); }   // not a valid purchase: stop retrying
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
    const def = Q.ALL[q.id], unit = def.metric === "meters" ? " m" : "";
    if (def.metric === "zone") return q.done ? "Reached" : "Not yet";
    if (def.metric === "cleanSeconds" || def.metric === "flySeconds") return fmtClock(q.progress * 1000) + " / " + fmtClock(q.target * 1000);
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
    const on = !!r && (S.mode === "nft" || S.mode === "demo") && game.state === "ready";   // after a crash the game over card shows them
    if (game.state === "dead") renderGoQuests();
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
    if (!S.quests || (S.mode !== "nft" && S.mode !== "demo")) return;
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
    if (homeMode === "demo" || S.mode === "demo") {   // demo quests: same rules, kept on this device
      S.quests = Demo.view();
      renderQuests(S.quests);
      $("questBody").insertAdjacentHTML("afterbegin", '<div class="demo-note"><span class="demo-tag">DEMO</span> Demo quests: progress is kept on this device and never ranked.</div>');
      return;
    }
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
    const rare = !r.players ? "" : pct > 0 ? "Earned by " + (pct < 1 ? "<1" : Math.round(pct)) + "% of pilots &middot; " + Q.rarity(pct) : "No pilot has earned this yet";
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
          const want = r.pin === id ? null : id;
          const out = S.mode === "demo" || homeMode === "demo" ? { pin: Demo.setPin(want) } : await apiCall("/badge/pin", { id: want }, S.auth.token);
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
