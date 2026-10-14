/*
 * Run card: a shareable image of a finished run, drawn on a canvas, in two formats:
 *   "wide"   1200x675  (16:9, shows uncropped in an X post)
 *   "square" 1080x1080 (feeds such as Instagram)
 * Laid out like other games' share cards: the rider's art front and centre, one huge number (total
 * distance), a NEW BEST badge, a stats row, a picture of how far the run got (the zone path), the
 * leaderboard rank once validated, and a challenge line with the game's link.
 */
(function (root) {
  const FORMATS = { wide: [1200, 675], square: [1080, 1080] };
  const INK = "#f4f1e8", MUTED = "#a9b1c2", AMBER = "#ffb84d", TEAL = "#4fd1c5";
  const TIER = { common: "#cfd6e3", uncommon: "#6ee7a8", rare: "#4fa8ff", epic: "#c084fc", legendary: "#ffcf4d" };
  const ZONES = [["Outer", "#7a8cff"], ["Belt", "#d8a46a"], ["Drift", "#3ad0ff"], ["Deep", "#b04cff"], ["Milky", "#ffd27a"]];
  const BUNGEE = "'Bungee', Impact, sans-serif", CHAKRA = "'Chakra Petch', Arial, sans-serif";

  // Deterministic pseudo-random so the same run always draws the same stars
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function background(g, W, H, seed) {
    g.fillStyle = "#070b18";
    g.fillRect(0, 0, W, H);
    // Soft nebula glows in blue, teal and amber (no purple-to-black gradient)
    [[0.15, 0.25, 0.5, "rgba(58,110,255,0.22)"], [0.9, 0.85, 0.55, "rgba(79,209,197,0.16)"], [0.82, 0.12, 0.35, "rgba(255,184,77,0.10)"]]
      .forEach(([x, y, r, c]) => {
        const R = r * Math.max(W, H), gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, R);
        gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      });
    const rand = rng(seed);
    for (let i = 0; i < (W * H) / 4200; i++) {
      const x = rand() * W, y = rand() * H, r = rand() < 0.08 ? 2.2 : 1 + rand() * 0.8;
      g.fillStyle = "rgba(255,255,255," + (0.2 + rand() * 0.55).toFixed(2) + ")";
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }

  // Sets the largest font (up to size) that fits text in maxW; returns that size
  function fitText(g, text, family, size, maxW, weight) {
    let s = size;
    for (;;) {
      g.font = (weight ? weight + " " : "") + s + "px " + family;
      if (g.measureText(text).width <= maxW || s <= 12) return s;
      s -= 2;
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function shadowText(g, text, x, y, color, off) {
    g.fillStyle = "#000"; g.fillText(text, x + off, y + off);
    g.fillStyle = color; g.fillText(text, x, y);
  }

  function logo(g, x, y, size) {
    g.textAlign = "left"; g.font = size + "px " + BUNGEE;
    shadowText(g, "CHOG", x, y, INK, 3);
    shadowText(g, "DASH", x + g.measureText("CHOG ").width, y, AMBER, 3);
  }

  function portrait(g, run, cx, cy, r, ring) {
    g.save();
    g.shadowColor = ring; g.shadowBlur = r * 0.35;
    g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, r + r * 0.07, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = "#0b1020"; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    if (run.portrait) {
      g.save();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      const iw = run.portrait.width, ih = run.portrait.height, s = Math.max((r * 2) / iw, (r * 2) / ih);
      g.drawImage(run.portrait, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
      g.restore();
    }
    if (run.rank) {   // rank medal on the ring
      const bx = cx + r * 0.74, by = cy - r * 0.74, br = r * 0.3;
      g.fillStyle = AMBER; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
      g.lineWidth = br * 0.1; g.strokeStyle = "#1a1205"; g.stroke();
      g.fillStyle = "#1a1205"; g.textAlign = "center";
      g.font = Math.round(br * 0.36) + "px " + BUNGEE; g.fillText("RANK", bx, by - br * 0.18);
      fitText(g, "#" + run.rank, BUNGEE, Math.round(br * 0.66), br * 1.6); g.fillText("#" + run.rank, bx, by + br * 0.5);
    }
    if (run.newBest) {   // ribbon under the portrait
      const w = r * 1.25, h = r * 0.27, x = cx - w / 2, y = cy + r * 0.88;
      g.save(); g.shadowColor = AMBER; g.shadowBlur = 18;
      roundRect(g, x, y, w, h, h / 2); g.fillStyle = AMBER; g.fill(); g.restore();
      g.fillStyle = "#1a1205"; g.textAlign = "center"; fitText(g, "NEW BEST", BUNGEE, Math.round(h * 0.6), w - 20);
      g.fillText("NEW BEST", cx, y + h * 0.74);
    }
    g.textAlign = "left";
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  // Three stat boxes: time, Stardust, near misses
  function stats(g, run, x, y, w, h) {
    const items = [["TIME", fmtTime(run.durationMs)], ["STARDUST", String(run.stardust || 0)], ["NEAR MISSES", String(run.nearMisses || 0)]];
    const gap = 12, bw = (w - gap * 2) / 3;
    items.forEach(([label, value], i) => {
      const bx = x + i * (bw + gap);
      roundRect(g, bx, y, bw, h, 14); g.fillStyle = "rgba(13,19,34,0.88)"; g.fill();
      g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,0.12)"; g.stroke();
      g.textAlign = "center";
      g.fillStyle = MUTED; g.font = "700 " + Math.round(h * 0.2) + "px " + CHAKRA; g.fillText(label, bx + bw / 2, y + h * 0.36);
      g.fillStyle = INK; fitText(g, value, BUNGEE, Math.round(h * 0.38), bw - 16); g.fillText(value, bx + bw / 2, y + h * 0.82);
    });
    g.textAlign = "left";
  }

  // The five zones as a path; the ones the run reached are lit, the furthest one ringed
  function zonePath(g, run, x, y, w) {
    const n = ZONES.length, step = w / (n - 1), reached = run.loop > 1 ? n - 1 : run.zoneIndex;
    g.lineWidth = 6; g.lineCap = "round";
    g.strokeStyle = "rgba(255,255,255,0.14)"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke();
    if (reached > 0) {
      const gr = g.createLinearGradient(x, 0, x + step * reached, 0);
      ZONES.slice(0, reached + 1).forEach(([, c], i) => gr.addColorStop(reached ? i / reached : 0, c));
      g.strokeStyle = gr; g.beginPath(); g.moveTo(x, y); g.lineTo(x + step * reached, y); g.stroke();
    }
    ZONES.forEach(([name, color], i) => {
      const cx = x + i * step, on = i <= reached, cur = i === run.zoneIndex;
      if (cur) { g.save(); g.shadowColor = color; g.shadowBlur = 16; g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); g.arc(cx, y, 17, 0, Math.PI * 2); g.stroke(); g.restore(); }
      g.fillStyle = on ? color : "#1a2236"; g.beginPath(); g.arc(cx, y, 10, 0, Math.PI * 2); g.fill();
      g.textAlign = "center"; g.font = "700 17px " + CHAKRA; g.fillStyle = on ? INK : MUTED; g.fillText(name.toUpperCase(), cx, y + 38);
    });
    if (run.loop > 1) { g.textAlign = "right"; g.fillStyle = AMBER; g.font = "700 18px " + CHAKRA; g.fillText("LOOP " + run.loop, x + w, y - 22); }
    g.textAlign = "left";
  }

  // A quest badge (see js/quests.js): the tier's frame in its metal, the glyph in the quest's colour
  function drawBadge(g, pin, cx, cy, size) {
    const Q = root.ChogQuests, b = Q && Q.badgeFor(pin.id), t = Q && Q.TIERS[pin.tier];
    if (!b || !t) return;
    g.save();
    g.translate(cx - size / 2, cy - size / 2); g.scale(size / 48, size / 48);
    const frame = new Path2D(Q.SHAPE_PATHS[t.shape]);
    g.shadowColor = b.color; g.shadowBlur = 16;
    g.fillStyle = "#121a2e"; g.fill(frame);
    g.shadowBlur = 0;
    g.lineWidth = 3; g.strokeStyle = t.metal; g.stroke(frame);
    g.translate(12, 12); g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = b.color;
    g.stroke(new Path2D(Q.GLYPH_PATHS[b.glyph]));
    g.restore();
  }

  // Name, sub line, the big number and how it was made. Returns the y below the block.
  function headline(g, run, x, y, w, scale, align) {
    const at = align === "center" ? x + w / 2 : x;
    g.textAlign = align || "left";
    const pinSize = run.pin ? Math.round(52 * scale) : 0, gap = pinSize ? 14 : 0;
    g.fillStyle = INK; const ns = fitText(g, run.username, BUNGEE, Math.round(46 * scale), w - pinSize - gap);
    const nw = g.measureText(run.username).width;
    const nx = align === "center" ? at - (pinSize + gap) / 2 : at;
    g.fillText(run.username, nx, y);
    // The player's pinned quest badge, right after their name
    if (pinSize) drawBadge(g, run.pin, (align === "center" ? nx + nw / 2 : nx + nw) + gap + pinSize / 2, y - ns * 0.36, pinSize);
    const sub = run.practice ? "Rookie, the practice pilot" : (run.chogName || "") + (run.tier ? "  ·  " + run.tier : "");
    g.fillStyle = MUTED; fitText(g, sub, CHAKRA, Math.round(24 * scale), w, "700"); g.fillText(sub, at, y + 38 * scale);
    g.fillStyle = TEAL; g.font = "700 " + Math.round(20 * scale) + "px " + CHAKRA;
    g.fillText(run.practice ? "DISTANCE" : "TOTAL DISTANCE", at, y + 92 * scale);
    const big = Number(run.practice ? run.meters : run.total).toLocaleString();
    const bs = fitText(g, big + " m", BUNGEE, Math.round(104 * scale), w);
    const bigY = y + 92 * scale + bs * 0.98;
    const bw = (g.font = bs + "px " + BUNGEE, g.measureText(big).width);
    g.font = Math.round(bs * 0.4) + "px " + BUNGEE; const mw = g.measureText(" m").width;
    let bx = align === "center" ? x + (w - bw - mw) / 2 : x;
    g.textAlign = "left"; g.font = bs + "px " + BUNGEE; shadowText(g, big, bx, bigY, AMBER, 5);
    g.font = Math.round(bs * 0.4) + "px " + BUNGEE; g.fillStyle = INK; g.fillText(" m", bx + bw, bigY);
    g.textAlign = align || "left";
    let yy = bigY;
    if (!run.practice) {
      g.fillStyle = MUTED; g.font = "700 " + Math.round(22 * scale) + "px " + CHAKRA;
      g.fillText(Number(run.meters).toLocaleString() + " m flown  x" + Number(run.multiplier).toFixed(2) + " tier", at, bigY + 36 * scale);
      yy = bigY + 36 * scale;
    }
    g.textAlign = "left";
    return yy;
  }

  function footer(g, run, W, y) {
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(48, y - 34, W - 96, 2);
    g.font = "700 22px " + CHAKRA; g.textAlign = "left";
    g.fillStyle = AMBER; g.fillText("Beat my run", 48, y);
    const lead = g.measureText("Beat my run").width;
    g.fillStyle = MUTED; g.fillText(run.url ? "  ·  " + run.url : "  ·  Chog Dash", 48 + lead, y);
    g.textAlign = "right"; g.fillText(run.date || new Date().toISOString().slice(0, 10), W - 48, y);
    g.textAlign = "left";
  }

  // run: { portrait, username, chogName, practice, meters, total, multiplier, tier, zoneIndex, zoneName, loop,
  //        durationMs, stardust, nearMisses, newBest, rank, url, date, pin: { id, tier } | null }
  function render(run, format) {
    const [W, H] = FORMATS[format] || FORMATS.wide;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.textBaseline = "alphabetic";
    background(g, W, H, (run.total || 0) * 31 + (run.meters || 0));
    const ring = run.practice ? AMBER : (TIER[String(run.tier || "").toLowerCase()] || TEAL);
    const tag = run.practice ? "PRACTICE RUN" : "CHOG GENESIS  ·  MONAD";

    if (W > H) {
      logo(g, 48, 74, 44);
      g.font = "700 20px " + CHAKRA; g.fillStyle = TEAL; g.textAlign = "right"; g.fillText(tag, W - 48, 64); g.textAlign = "left";
      portrait(g, run, 270, 350, 175, ring);
      const x = 530, w = W - x - 48;
      headline(g, run, x, 150, w, 1, "left");
      stats(g, run, x, 400, w, 82);
      zonePath(g, run, x + 18, 540, w - 36);
      footer(g, run, W, H - 30);
    } else {
      logo(g, 48, 86, 50);
      g.font = "700 22px " + CHAKRA; g.fillStyle = TEAL; g.textAlign = "right"; g.fillText(tag, W - 48, 76); g.textAlign = "left";
      portrait(g, run, W / 2, 310, 170, ring);
      headline(g, run, 60, 560, W - 120, 1.05, "center");
      stats(g, run, 60, 822, W - 120, 86);
      zonePath(g, run, 120, 950, W - 240);
      footer(g, run, W, H - 28);
    }
    return c;
  }

  // Waits for the card fonts so the first card isn't drawn in a fallback font
  async function ready() {
    if (!document.fonts || !document.fonts.load) return;
    try { await Promise.all([document.fonts.load("64px Bungee"), document.fonts.load("700 24px 'Chakra Petch'")]); } catch (e) {}
  }

  root.ChogCard = { render, ready, FORMATS };
})(window);
