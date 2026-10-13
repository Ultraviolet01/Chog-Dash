/*
 * Run card: a 1080x1080 shareable image of a finished run, drawn on a canvas.
 * Shows the rider's portrait (the Chog's own artwork, or Rookie in practice), the username,
 * the total distance and how it was made, the furthest zone and the leaderboard rank if any.
 */
(function (root) {
  const W = 1080, H = 1080;
  const INK = "#f4f1e8", MUTED = "#a9b1c2", AMBER = "#ffb84d", TEAL = "#4fd1c5";
  const TIER = { common: "#cfd6e3", uncommon: "#6ee7a8", rare: "#4fa8ff", epic: "#c084fc", legendary: "#ffcf4d" };

  // Deterministic pseudo-random so the same run always draws the same stars
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function background(g, seed) {
    g.fillStyle = "#070b18";
    g.fillRect(0, 0, W, H);
    // Soft nebula glows in blue and teal (no purple-to-black gradient)
    [[180, 220, 520, "rgba(58,110,255,0.22)"], [920, 860, 560, "rgba(79,209,197,0.16)"], [860, 140, 380, "rgba(255,184,77,0.10)"]]
      .forEach(([x, y, r, c]) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, c); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      });
    const rand = rng(seed);
    for (let i = 0; i < 260; i++) {
      const x = rand() * W, y = rand() * H, r = rand() < 0.08 ? 2.2 : 1 + rand() * 0.8;
      g.fillStyle = "rgba(255,255,255," + (0.25 + rand() * 0.6).toFixed(2) + ")";
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Speed streaks behind the portrait
    g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const y = 300 + rand() * 520, x = 40 + rand() * 200;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 180 + rand() * 260, y); g.stroke();
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

  // run: { portrait (image or canvas), username, chogName, practice, meters, total, multiplier, tier, zoneName,
  //        zoneNumber, rank, lookName, date }
  function render(run) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    background(g, (run.total || 0) * 31 + (run.meters || 0));
    const BUNGEE = "'Bungee', Impact, sans-serif", CHAKRA = "'Chakra Petch', Arial, sans-serif";
    const ring = run.practice ? AMBER : (TIER[String(run.tier || "").toLowerCase()] || TEAL);

    // Logo
    g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = "64px " + BUNGEE;
    g.fillStyle = "#000"; g.fillText("CHOG", 72, 136); g.fillStyle = INK; g.fillText("CHOG", 68, 130);
    const cw = g.measureText("CHOG ").width;
    g.fillStyle = "#000"; g.fillText("DASH", 72 + cw, 136); g.fillStyle = AMBER; g.fillText("DASH", 68 + cw, 130);
    g.font = "700 22px " + CHAKRA; g.fillStyle = TEAL;
    g.fillText(run.practice ? "PRACTICE RUN" : "CHOG GENESIS  ·  MONAD", 70, 172);

    // Portrait in a glowing ring
    const px = 300, py = 520, pr = 210;
    g.save();
    g.shadowColor = ring; g.shadowBlur = 60;
    g.fillStyle = ring; g.beginPath(); g.arc(px, py, pr + 14, 0, Math.PI * 2); g.fill();
    g.restore();
    g.fillStyle = "#0b1020"; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    if (run.portrait) {
      g.save();
      g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.clip();
      const iw = run.portrait.width, ih = run.portrait.height, s = Math.max((pr * 2) / iw, (pr * 2) / ih);
      g.drawImage(run.portrait, px - (iw * s) / 2, py - (ih * s) / 2, iw * s, ih * s);
      g.restore();
    }
    // Rank badge on the ring
    if (run.rank) {
      const bx = px + pr * 0.72, by = py - pr * 0.72;
      g.fillStyle = AMBER; g.beginPath(); g.arc(bx, by, 62, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = "#1a1205"; g.stroke();
      g.fillStyle = "#1a1205"; g.textAlign = "center";
      g.font = "22px " + BUNGEE; g.fillText("RANK", bx, by - 12);
      fitText(g, "#" + run.rank, BUNGEE, 40, 100); g.fillText("#" + run.rank, bx, by + 30);
      g.textAlign = "left";
    }

    // Name and Chog
    const tx = 570, tw = W - tx - 60;
    g.fillStyle = INK;
    fitText(g, run.username, BUNGEE, 54, tw); g.fillText(run.username, tx, 330);
    g.fillStyle = MUTED;
    const sub = run.practice ? "Rookie, the practice pilot" : (run.chogName || "") + (run.tier ? "  ·  " + run.tier : "");
    fitText(g, sub, CHAKRA, 28, tw, "700");
    g.fillText(sub, tx, 374);

    // Total distance
    g.fillStyle = TEAL; g.font = "700 24px " + CHAKRA;
    g.fillText(run.practice ? "DISTANCE" : "TOTAL DISTANCE", tx, 468);
    const big = Number(run.practice ? run.meters : run.total).toLocaleString();
    const bs = fitText(g, big, BUNGEE, 120, tw - 70);
    g.fillStyle = "#000"; g.fillText(big, tx + 5, 590 + 5);
    g.fillStyle = AMBER; g.fillText(big, tx, 590);
    const bw = g.measureText(big).width;
    g.font = Math.round(bs * 0.42) + "px " + BUNGEE; g.fillStyle = INK; g.fillText("m", tx + bw + 10, 590);
    g.font = "700 26px " + CHAKRA; g.fillStyle = MUTED;
    if (!run.practice) g.fillText(Number(run.meters).toLocaleString() + " m flown  x" + Number(run.multiplier).toFixed(2) + " tier", tx, 640);

    // Zone reached
    roundRect(g, tx, 690, tw, 92, 18);
    g.fillStyle = "rgba(13,19,34,0.85)"; g.fill();
    g.lineWidth = 2; g.strokeStyle = "rgba(79,209,197,0.5)"; g.stroke();
    g.fillStyle = MUTED; g.font = "700 20px " + CHAKRA; g.fillText("REACHED", tx + 24, 726);
    g.fillStyle = INK; fitText(g, run.zoneName, BUNGEE, 32, tw - 48);
    g.fillText(run.zoneName, tx + 24, 764);

    // Footer
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(68, 930, W - 136, 2);
    g.font = "700 24px " + CHAKRA; g.fillStyle = MUTED; g.textAlign = "left";
    g.fillText(run.lookName ? "Rocket: " + run.lookName : "Can you fly further?", 68, 984);
    g.textAlign = "right";
    g.fillText(run.date || new Date().toISOString().slice(0, 10), W - 68, 984);
    g.textAlign = "left";
    return c;
  }

  // Waits for the card fonts so the first card isn't drawn in a fallback font
  async function ready() {
    if (!document.fonts || !document.fonts.load) return;
    try { await Promise.all([document.fonts.load("64px Bungee"), document.fonts.load("700 24px 'Chakra Petch'")]); } catch (e) {}
  }

  root.ChogCard = { render, ready, SIZE: W };
})(window);
