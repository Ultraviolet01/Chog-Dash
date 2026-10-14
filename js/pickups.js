/*
 * Pickups: collectibles (Stardust, Golden Horn) and power-ups (Dash, Magnet, Slow-Mo, Nova, Radar, Mystery Box).
 *
 * - Nothing spawns before pickups.firstAt seconds; pickups can appear anywhere, risky spots included.
 * - The same power-up type is never on screen twice at once.
 * - Picking up a power-up that is already running adds its base time on top.
 * - Every stardustPerLife Stardust gives an extra life (max maxLives). A crash with a life in stock
 *   uses it: the run continues with reviveSeconds of protection.
 * - Radar only appears in the Deep Cosmic Zone.
 * Tuning lives in js/config.js (game.pickups).
 */
(function (root) {
  const P = root.ChogConfig.game.pickups;
  const rand = (a, b) => a + Math.random() * (b - a);

  const TYPES = {
    dash: { name: "DASH", color: "#ffb84d", seconds: P.dashSeconds },
    magnet: { name: "MAGNET", color: "#4fd1ff", seconds: P.magnetSeconds },
    slow: { name: "SLOW-MO", color: "#b48cff", seconds: P.slowSeconds },
    nova: { name: "NOVA", color: "#ffffff", seconds: 0 },
    radar: { name: "RADAR", color: "#4fe0c5", seconds: P.radarSeconds, zones: ["deep"] },
    mystery: { name: "MYSTERY BOX", color: "#ffd84d", seconds: 0 },
  };
  const WEIGHTS = { dash: 1, magnet: 1, slow: 1, nova: 0.6, radar: 1.2, mystery: 0.8 };

  // Types that may spawn in a zone, leaving out any already on screen
  function allowedTypes(zoneId, onField) {
    return Object.keys(TYPES).filter(t => (!TYPES[t].zones || TYPES[t].zones.includes(zoneId)) && !(onField || []).includes(t));
  }
  function pickType(types, rnd) {
    const total = types.reduce((s, t) => s + WEIGHTS[t], 0);
    let r = (rnd == null ? Math.random() : rnd) * total;
    for (const t of types) { r -= WEIGHTS[t]; if (r <= 0) return t; }
    return types[types.length - 1];
  }

  // ---------- Icon art (used for the 3D pickups and the HUD) ----------
  // disk: true for the HUD badge (dark disk and ring); false for the symbol floating inside a bubble
  // Power-up icons, sticker style like other games' power-ups: a bold solid glyph with a thick dark
  // outline, filling most of the bubble so its shape reads from far away.
  // disk: the small HUD version (coloured glyph on a dark disk).
  function iconCanvas(type, disk) {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), col = TYPES[type].color;
    const INK = "#0d1020", FILL = disk ? col : "#ffffff";
    if (disk) {
      const glow = g.createRadialGradient(64, 64, 30, 64, 64, 64);
      glow.addColorStop(0, col); glow.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.45; g.fillStyle = glow; g.fillRect(0, 0, S, S); g.globalAlpha = 1;
      g.fillStyle = "#0b1020"; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = col; g.stroke();
      g.translate(64, 64); g.scale(0.62, 0.62); g.translate(-64, -64);   // glyph fits inside the disk
    }
    g.lineCap = "round"; g.lineJoin = "round";
    // Filled shape: dark outline first, then the fill
    const solid = path => { path(); if (!disk) { g.lineWidth = 12; g.strokeStyle = INK; g.stroke(); } g.fillStyle = FILL; path(); g.fill(); };
    // Thick line: dark outline first, then the line
    const line = (path, w) => { if (!disk) { path(); g.lineWidth = w + 12; g.strokeStyle = INK; g.stroke(); } path(); g.lineWidth = w; g.strokeStyle = FILL; g.stroke(); };
    const poly = pts => () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    if (type === "dash") {   // lightning bolt
      solid(poly([[78, 12], [32, 72], [60, 72], [46, 116], [98, 50], [70, 50], [88, 12]]));
    } else if (type === "magnet") {   // horseshoe magnet with silver tips
      line(() => { g.beginPath(); g.moveTo(36, 26); g.lineTo(36, 64); g.arc(64, 64, 28, Math.PI, 0, true); g.lineTo(92, 26); }, 22);
      const tip = x => () => { g.beginPath(); g.rect(x - 13, 16, 26, 20); };
      [36, 92].forEach(x => { if (!disk) { tip(x)(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke(); } g.fillStyle = disk ? "#ffffff" : "#c9d6e6"; tip(x)(); g.fill(); });
    } else if (type === "slow") {   // hourglass with sand
      line(() => { g.beginPath(); g.moveTo(30, 18); g.lineTo(98, 18); g.moveTo(30, 110); g.lineTo(98, 110); }, 10);
      solid(() => { g.beginPath(); g.moveTo(38, 22); g.lineTo(90, 22); g.lineTo(68, 64); g.lineTo(90, 106); g.lineTo(38, 106); g.lineTo(60, 64); g.closePath(); });
      g.fillStyle = disk ? "#ffffff" : col;
      g.beginPath(); g.moveTo(44, 102); g.lineTo(84, 102); g.lineTo(64, 80); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(52, 32); g.lineTo(76, 32); g.lineTo(64, 50); g.closePath(); g.fill();
    } else if (type === "nova") {   // starburst
      solid(() => { g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 20 : 52; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); });
      g.fillStyle = disk ? "#ffffff" : col; g.beginPath(); g.arc(64, 64, 11, 0, Math.PI * 2); g.fill();
    } else if (type === "radar") {   // radar screen with a sweep
      line(() => { g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); }, 10);
      line(() => { g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2); }, 7);
      solid(() => { g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 42, -Math.PI / 2, -Math.PI / 8); g.closePath(); });
      g.fillStyle = disk ? "#ffffff" : col; g.beginPath(); g.arc(88, 84, 6, 0, Math.PI * 2); g.fill();
    } else if (type === "mystery") {   // bold question mark
      g.font = "900 104px 'Arial Black', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      if (!disk) { g.lineWidth = 14; g.strokeStyle = INK; g.strokeText("?", 64, 70); }
      g.fillStyle = FILL; g.fillText("?", 64, 70);
    }
    return c;
  }

  // Water bubble tinted in the power-up's colour, in two layers: the body (behind the icon) and the
  // shine (in front of it). The colour alone tells you which power-up it is from far away.
  function bubbleCanvas(front, color) {
    const S = 256, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), r = 118, col = color || "#78c8ff";
    const rgba = a => { const n = parseInt(col.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; };
    if (!front) {
      const body = g.createRadialGradient(110, 100, 10, 128, 128, r);
      body.addColorStop(0, rgba(0.28)); body.addColorStop(0.65, rgba(0.42)); body.addColorStop(0.9, rgba(0.7)); body.addColorStop(1, rgba(0.15));
      g.fillStyle = body; g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = 9; g.strokeStyle = rgba(0.95); g.beginPath(); g.arc(128, 128, r - 5, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(128, 128, r - 11, 0, Math.PI * 2); g.stroke();
      return c;
    }
    // Glassy highlights
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.beginPath(); g.ellipse(86, 70, 32, 15, -0.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.arc(180, 186, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 6;
    g.beginPath(); g.arc(128, 128, r - 20, 2.25, 2.95); g.stroke();
    return c;
  }

  // Stardust: a chunky golden star (four long points, four short) with a white-hot centre and a wide
  // halo. Drawn with additive blending in the game, so it glows against dark space and reads from afar.
  function stardustCanvas() {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), m = S / 2;
    const halo = g.createRadialGradient(m, m, 0, m, m, m);
    halo.addColorStop(0, "rgba(255,246,214,1)"); halo.addColorStop(0.18, "rgba(255,214,110,0.85)");
    halo.addColorStop(0.45, "rgba(255,180,60,0.32)"); halo.addColorStop(1, "rgba(255,160,40,0)");
    g.fillStyle = halo; g.fillRect(0, 0, S, S);
    const star = (outer, inner, points, rot) => {
      g.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer, a = rot + (i * Math.PI) / points;
        g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      g.closePath();
    };
    const body = g.createRadialGradient(m, m, 0, m, m, 50);
    body.addColorStop(0, "#ffffff"); body.addColorStop(0.35, "#fff1b0"); body.addColorStop(1, "#ffc23a");
    g.fillStyle = body;
    star(30, 10, 4, Math.PI / 4); g.fill();          // short diagonal points
    star(52, 12, 4, -Math.PI / 2); g.fill();         // long main points
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(m, m, 9, 0, Math.PI * 2); g.fill();
    return c;
  }

  // Golden Horn: the rare prize. A chunky ridged horn with a thick outline and a shine.
  function hornCanvas() {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const glow = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    glow.addColorStop(0, "rgba(255,215,90,0.75)"); glow.addColorStop(1, "rgba(255,190,60,0)");
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    g.lineJoin = "round"; g.lineCap = "round";
    const horn = () => { g.beginPath(); g.moveTo(26, 110); g.quadraticCurveTo(18, 44, 104, 12); g.quadraticCurveTo(64, 50, 78, 110); g.quadraticCurveTo(52, 118, 26, 110); g.closePath(); };
    horn(); g.lineWidth = 11; g.strokeStyle = "#3a2203"; g.stroke();
    const grad = g.createLinearGradient(26, 110, 104, 12);
    grad.addColorStop(0, "#b8730f"); grad.addColorStop(0.45, "#ffcf3d"); grad.addColorStop(1, "#fff4c2");
    horn(); g.fillStyle = grad; g.fill();
    // Ridges around the horn
    g.save(); horn(); g.clip();
    g.strokeStyle = "rgba(120,70,5,0.55)"; g.lineWidth = 5;
    [[32, 86, 74, 92], [36, 62, 76, 70], [48, 40, 84, 48]].forEach(([x1, y1, x2, y2]) => { g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo((x1 + x2) / 2, y1 + 14, x2, y2); g.stroke(); });
    g.restore();
    // Shine
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(36, 96); g.quadraticCurveTo(32, 52, 82, 26); g.stroke();
    return c;
  }

  // Soft round glow, tinted per power-up so each one shows up from far away
  function glowCanvas() {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.35, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  }

  const sfx = name => { if (root.ChogAudio) root.ChogAudio.play(name); };

  // ---------- Pickup system ----------
  // api: { player() -> Vector3, hitOffsetY, boundX, boundY, spawnZ, despawnZ, nova(), sparkle(pos, colorHex) }
  function create(scene, api) {
    const tex = c => new THREE.CanvasTexture(c);
    const symbols = {}, iconUrls = {};
    Object.keys(TYPES).forEach(t => { symbols[t] = tex(iconCanvas(t, false)); iconUrls[t] = iconCanvas(t, true).toDataURL(); });
    const bubbleBacks = {}; Object.keys(TYPES).forEach(t => { bubbleBacks[t] = tex(bubbleCanvas(false, TYPES[t].color)); });
    const bubbleFront = tex(bubbleCanvas(true)), glowTex = tex(glowCanvas());
    const BUBBLE = 3.0, SYMBOL = 2.45, HORN_SIZE = 2.9;
    const DUST_SIZE = 1.5;   // Stardust sprite size up close (it is drawn larger further away, see animate)
    let pops = [];
    const dustTex = tex(stardustCanvas()), hornTex = tex(hornCanvas());

    let items = [];
    const active = {}, activeMax = {};
    let lives = 0, meter = 0, runDust = 0, revive = 0;
    let runPowerups = 0, runHorns = 0, livesUsed = 0;   // counted for quests
    // Streak lives (Chog holders): a banked stock from quest streaks, on top of the Stardust lives and the cap.
    // Spent only after the run's Stardust lives are gone; what's left stays in the bank.
    let bankStart = 0, bankLives = 0, bankUsed = 0;
    let nextDust = 0, nextPower = 0, nextHorn = 0;

    // HUD
    const $ = id => document.getElementById(id);
    const hud = { dust: $("dustCount"), bar: $("dustBar"), lives: $("livesCount"), power: $("powerBar"), pop: $("pickupPop"), flash: $("flash") };
    const powerEls = {};
    let popTimer = 0;
    function popup(text, color) {
      hud.pop.textContent = text;
      hud.pop.style.color = color || "#fff";
      hud.pop.style.opacity = 1;
      popTimer = 1.1;
    }

    const spriteOf = (map, size, glow) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false,
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
      sp.scale.set(size, size, 1);
      return sp;
    };

    function addItem(kind, type, x, y, z) {
      let sprite, parts = null;
      if (kind === "power") {
        // Power-ups float inside a water bubble: body behind, symbol in the middle, shine in front
        sprite = new THREE.Group();
        parts = { glow: spriteOf(glowTex, BUBBLE * 2.4, true), back: spriteOf(bubbleBacks[type], BUBBLE), icon: spriteOf(symbols[type], SYMBOL), front: spriteOf(bubbleFront, BUBBLE) };
        parts.glow.material.color.set(TYPES[type].color);
        parts.glow.position.z = -0.1; parts.back.position.z = -0.05; parts.front.position.z = 0.05;
        sprite.add(parts.glow, parts.back, parts.icon, parts.front);
      } else {
        sprite = spriteOf(kind === "horn" ? hornTex : dustTex, kind === "horn" ? HORN_SIZE : DUST_SIZE, kind !== "horn");
      }
      sprite.position.set(x, y, z);
      scene.add(sprite);
      const item = { kind, type, sprite, parts, baseY: y, phase: Math.random() * 6, size: kind === "horn" ? HORN_SIZE : DUST_SIZE };
      items.push(item);
      return item;
    }

    function spawnDustPattern() {
      const n = Math.floor(rand(5, 11));
      const x0 = rand(-api.boundX + 0.5, api.boundX - 0.5), y0 = rand(-api.boundY + 0.5, api.boundY - 0.5);
      const shape = Math.floor(Math.random() * 3);   // 0 line, 1 wave, 2 diagonal
      const dx = rand(-0.5, 0.5), dy = rand(-0.4, 0.4);
      for (let i = 0; i < n; i++) {
        let x = x0, y = y0;
        if (shape === 1) { x = x0 + Math.sin(i * 0.7) * 2.2; }
        if (shape === 2) { x = x0 + dx * i; y = y0 + dy * i; }
        x = Math.max(-api.boundX, Math.min(api.boundX, x));
        y = Math.max(-api.boundY, Math.min(api.boundY, y));
        addItem("stardust", null, x, y + api.hitOffsetY, api.spawnZ() - i * 5);
      }
    }

    function onField() { return items.filter(i => i.kind === "power").map(i => i.type); }

    function spawnPower(zoneId) {
      const types = allowedTypes(zoneId, onField());
      if (!types.length) return null;
      const type = pickType(types);
      // Within the central 75% of the flying area, so it's always in view and reachable
      return addItem("power", type, rand(-api.boundX * 0.75, api.boundX * 0.75), rand(-api.boundY * 0.75, api.boundY * 0.75) + api.hitOffsetY, api.spawnZ());
    }

    function addStardust(n) {
      runDust += n;
      meter += n;
      let gained = false;
      while (meter >= P.stardustPerLife && lives < P.maxLives) { meter -= P.stardustPerLife; lives++; gained = true; }
      if (lives >= P.maxLives) meter = Math.min(meter, P.stardustPerLife);
      if (gained) { popup("EXTRA LIFE", "#6ee7a8"); sfx("life"); }
    }

    function activate(type, zoneId, fromMystery) {
      if (type === "mystery") {
        const pool = allowedTypes(zoneId, []).filter(t => t !== "mystery");
        return activate(pickType(pool), zoneId, true);
      }
      const label = (fromMystery ? "MYSTERY: " : "") + TYPES[type].name;
      // Each power-up has its own tone; after a Mystery Box roll, the revealed power's tone follows
      if (fromMystery) { sfx("mystery"); setTimeout(() => sfx(type), 260); } else sfx(type);
      if (type === "nova") { api.nova(); popup(label, TYPES.nova.color); return type; }
      const extending = (active[type] || 0) > 0;
      active[type] = (extending ? active[type] : 0) + TYPES[type].seconds;
      activeMax[type] = active[type];
      popup(label + (extending ? " +" + TYPES[type].seconds + "s" : ""), TYPES[type].color);
      return type;
    }

    function collect(item, zoneId) {
      if (item.kind === "stardust") { sfx("stardust"); addStardust(1); api.sparkle(item.sprite.position, 0xffd27a); }
      else if (item.kind === "horn") { runHorns++; sfx("horn"); addStardust(P.hornStardust); popup("GOLDEN HORN +" + P.hornStardust, "#ffd45a"); api.sparkle(item.sprite.position, 0xffd45a); }
      else {
        runPowerups++;
        sfx("bubble");
        activate(item.type, zoneId);
        // The bubble pops: an expanding ring plus a splash of droplets
        const ring = spriteOf(bubbleBacks[item.type], BUBBLE);
        ring.position.copy(item.sprite.position);
        scene.add(ring);
        pops.push({ ring, life: 0.3 });
        api.sparkle(item.sprite.position, 0xbfe8ff);
        api.sparkle(item.sprite.position, parseInt(TYPES[item.type].color.slice(1), 16));
      }
    }

    function removeItem(item) {
      scene.remove(item.sprite);
      item.sprite.traverse(o => { if (o.material) o.material.dispose(); });
    }

    function reset() {
      items.forEach(removeItem);
      items = [];
      pops.forEach(pp => { scene.remove(pp.ring); pp.ring.material.dispose(); });
      pops = [];
      Object.keys(active).forEach(k => { active[k] = 0; });
      lives = 0; meter = 0; runDust = 0; revive = 0;
      runPowerups = 0; runHorns = 0; livesUsed = 0;
      bankLives = bankStart; bankUsed = 0;
      nextDust = P.firstAt; nextPower = P.firstAt + rand(0, 3); nextHorn = P.firstAt + rand(30, 60);
      popTimer = 0; hud.pop.style.opacity = 0;
      updateHud();
    }

    let lastHud = "";
    function updateHud() {
      const key = runDust + "|" + meter + "|" + lives + "|" + bankLives;
      if (key !== lastHud) {
        lastHud = key;
        hud.dust.textContent = (lives >= P.maxLives ? "MAX" : meter + "/" + P.stardustPerLife);
        hud.bar.style.width = (Math.min(1, meter / P.stardustPerLife) * 100) + "%";
        hud.lives.innerHTML = lives + (bankLives > 0 ? ' <span class="bank" title="Streak lives">+' + bankLives + "</span>" : "");
      }
      // Active power-up icons with countdown rings
      ["dash", "magnet", "slow", "radar"].forEach(t => {
        const left = active[t] || 0;
        let el = powerEls[t];
        if (left > 0) {
          if (!el) {
            el = powerEls[t] = document.createElement("div");
            el.className = "pw";
            el.innerHTML = '<img alt=""><span></span>';
            el.querySelector("img").src = iconUrls[t];
            hud.power.appendChild(el);
          }
          const pct = Math.max(0, Math.min(1, left / (activeMax[t] || 1))) * 100;
          el.style.background = "conic-gradient(" + TYPES[t].color + " " + pct + "%, rgba(255,255,255,0.12) 0)";
          el.querySelector("span").textContent = Math.ceil(left) + "s";
        } else if (el) {
          el.remove();
          delete powerEls[t];
        }
      });
    }

    // Keep every pickup moving: bubbles wobble and bob with the symbol swaying inside,
    // Stardust spins and twinkles, Golden Horns sway and pulse
    function animate(item, now, dt) {
      const t = now + item.phase, s = item.sprite;
      if (item.kind === "power") {
        if (!item.homing) s.position.y = item.baseY + Math.sin(t * 2.2) * 0.25;
        const w = Math.sin(t * 4.5) * 0.07, w2 = Math.sin(t * 3.1) * 0.04;
        item.parts.back.scale.set(BUBBLE * (1 + w + w2), BUBBLE * (1 - w + w2), 1);
        item.parts.front.scale.set(BUBBLE * (1 + w + w2), BUBBLE * (1 - w + w2), 1);
        item.parts.icon.material.rotation = Math.sin(t * 1.7) * 0.35;
        item.parts.icon.position.set(Math.sin(t * 1.3) * 0.12, Math.sin(t * 2.6) * 0.1, 0);
        const pulse = SYMBOL * (1 + Math.sin(t * 5) * 0.05);
        item.parts.icon.scale.set(pulse, pulse, 1);
        // Coloured glow pulses; far away the whole bubble is drawn larger so it can be spotted early
        item.parts.glow.material.opacity = 0.8 + Math.sin(t * 3.2) * 0.2;
        if (!item.homing) s.scale.setScalar(1 + Math.min(4, Math.max(0, -s.position.z) / 60));
      } else if (item.kind === "horn") {
        if (!item.homing) s.position.y = item.baseY + Math.sin(t * 2.2) * 0.2;
        // Turns like a spinning coin: narrows to its edge and back
        const pulse = item.size * (1 + Math.sin(t * 4) * 0.06);
        s.scale.set(pulse * (0.3 + 0.7 * Math.abs(Math.cos(t * 2.2))), pulse, 1);
      } else {
        // Stardust: slow spin and a gentle twinkle. Far away it is drawn larger so it can be spotted early;
        // it shrinks back to its normal size as it reaches the rocket.
        const far = 1 + Math.min(3, Math.max(0, -s.position.z) / 100);
        const k = item.size * far * (1 + Math.sin(t * 5) * 0.1);
        s.scale.set(k * (0.55 + 0.45 * Math.abs(Math.cos(t * 3))), k, 1);   // coin-like turn
      }
    }

    // dt: frame time; speed: world speed; t: seconds into the run; zoneId: current zone; playing: run in progress
    function update(dt, speed, t, zoneId, playing) {
      if (playing) {
        Object.keys(active).forEach(k => { if (active[k] > 0) active[k] = Math.max(0, active[k] - dt); });
        if (revive > 0) revive = Math.max(0, revive - dt);
        if (t >= nextDust) { spawnDustPattern(); nextDust = t + rand(2.5, 4.5); }
        if (t >= nextPower) { spawnPower(zoneId); nextPower = t + rand(P.powerGapMin, P.powerGapMax); }
        if (t >= nextHorn) { addItem("horn", null, rand(-api.boundX + 0.5, api.boundX - 0.5), rand(-api.boundY + 0.5, api.boundY - 0.5) + api.hitOffsetY, api.spawnZ()); nextHorn = t + rand(80, 140); }
      }
      const p = api.player(), py = p.y + api.hitOffsetY;
      const magnet = playing && (active.magnet || 0) > 0;
      const now = performance.now() / 1000;
      items = items.filter(item => {
        const s = item.sprite.position;
        // Magnet: once caught, a collectible homes in on the rocket instead of flying past with the world
        if (magnet && item.kind !== "power" && !item.homing && s.z > -45 && s.z < 3 && Math.hypot(s.x - p.x, s.y - py) < P.magnetRadius) item.homing = true;
        const prevZ = s.z;
        if (item.homing) {
          const k = Math.min(1, dt * 9);
          s.x += (p.x - s.x) * k; s.y += (py - s.y) * k; s.z += (p.z - s.z) * k;
        } else {
          s.z += speed * dt;
        }
        animate(item, now, dt);
        // Once a missed pickup is past the rocket it fades out, so it doesn't flare up as it passes the camera
        if (!item.homing) {
          const fade = s.z > p.z ? Math.max(0, 1 - (s.z - p.z) / 4) : 1;
          if (fade < 1 || item.faded) {
            item.faded = true;
            item.sprite.traverse(o => { if (o.material) o.material.opacity = Math.min(o.material.opacity, fade); });
          }
        }
        const r = item.kind === "power" ? 1.4 : item.kind === "horn" ? 1.45 : 1.2;   // Stardust radius matches its bigger look
        // Closest approach along this frame's move, so fast flying can't skip over a pickup
        const zc = prevZ <= p.z && s.z >= p.z ? p.z : (Math.abs(p.z - s.z) < Math.abs(p.z - prevZ) ? s.z : prevZ);
        if (playing && Math.hypot(s.x - p.x, s.y - py, zc - p.z) < r) { collect(item, zoneId); removeItem(item); return false; }
        if (s.z > api.despawnZ) { removeItem(item); return false; }
        return true;
      });
      pops = pops.filter(pp => {
        pp.life -= dt;
        const k = 1 - Math.max(0, pp.life) / 0.3;
        pp.ring.scale.setScalar(BUBBLE * (1 + k * 0.9));
        pp.ring.material.opacity = 1 - k;
        pp.ring.position.z += speed * dt;
        if (pp.life <= 0) { scene.remove(pp.ring); pp.ring.material.dispose(); return false; }
        return true;
      });
      if (popTimer > 0) { popTimer -= dt; hud.pop.style.opacity = Math.max(0, Math.min(1, popTimer / 0.4)).toFixed(2); }
      updateHud();
    }

    return {
      update, reset, activate: (type, zoneId) => activate(type, zoneId),
      speedFactor() { return ((active.dash || 0) > 0 ? P.dashSpeedMult : 1) * ((active.slow || 0) > 0 ? P.slowSpeedMult : 1); },
      dashing: () => (active.dash || 0) > 0,
      slowed: () => (active.slow || 0) > 0,
      radarOn: () => (active.radar || 0) > 0,
      magnetOn: () => (active.magnet || 0) > 0,
      reviving: () => revive > 0,
      // Used when the rocket hits something it can't smash: spends a life if one is in stock
      tryUseLife() {
        if (lives <= 0 && bankLives <= 0) return false;
        const fromBank = lives <= 0;
        if (fromBank) { bankLives--; bankUsed++; } else lives--;
        livesUsed++;
        sfx("lifeUsed");
        revive = P.reviveSeconds;
        addStardust(0);
        popup(fromBank ? "STREAK LIFE USED" : "LIFE USED", fromBank ? "#ff9a5a" : "#6ee7a8");
        return true;
      },
      stats: () => ({ stardust: runDust, lives, meter, powerups: runPowerups, horns: runHorns, livesUsed, bankLives, bankUsed }),
      // Streak lives available for the next run
      setBank(n) { bankStart = Math.max(0, Math.floor(n) || 0); bankLives = bankStart; bankUsed = 0; updateHud(); },
      // Test hooks
      _debug: {
        items: () => items, active, spawn: (kind, type, x, y, z) => addItem(kind, type, x, y, z),
        addStardust, setNext(d, pw, h) { nextDust = d; nextPower = pw; nextHorn = h; }, spawnPower,
      },
    };
  }

  root.ChogPickups = { create, TYPES, allowedTypes, pickType, icons: { iconCanvas, bubbleCanvas, stardustCanvas, hornCanvas } };
})(window);
