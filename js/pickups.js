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
  function iconCanvas(type, disk) {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), col = TYPES[type].color;
    if (disk) {
      const glow = g.createRadialGradient(64, 64, 30, 64, 64, 64);
      glow.addColorStop(0, col); glow.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.45; g.fillStyle = glow; g.fillRect(0, 0, S, S); g.globalAlpha = 1;
      g.fillStyle = "#0b1020"; g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fill();
      g.lineWidth = 6; g.strokeStyle = col; g.stroke();
    } else {
      g.shadowColor = col; g.shadowBlur = 14;
    }
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = "round"; g.lineJoin = "round";
    if (type === "dash") {
      g.beginPath();
      [[72, 30], [44, 70], [62, 70], [54, 100], [86, 56], [68, 56], [80, 30]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath(); g.fill();
    } else if (type === "magnet") {
      g.lineWidth = 14;
      g.beginPath(); g.moveTo(44, 38); g.lineTo(44, 64); g.arc(64, 64, 20, Math.PI, 0, true); g.lineTo(84, 38); g.stroke();
      g.fillStyle = "#ffffff"; g.fillRect(37, 32, 14, 12); g.fillRect(77, 32, 14, 12);
    } else if (type === "slow") {
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(44, 34); g.lineTo(84, 34); g.lineTo(64, 64); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(44, 94); g.lineTo(84, 94); g.lineTo(64, 64); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(40, 30); g.lineTo(88, 30); g.moveTo(40, 98); g.lineTo(88, 98); g.stroke();
    } else if (type === "nova") {
      g.lineWidth = 6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r = i % 2 ? 22 : 34;
        g.beginPath(); g.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10); g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); g.stroke();
      }
      g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill();
    } else if (type === "radar") {
      g.lineWidth = 6;
      [16, 28, 40].forEach(r => { g.beginPath(); g.arc(46, 84, r, -Math.PI / 2, 0); g.stroke(); });
      g.beginPath(); g.arc(46, 84, 6, 0, Math.PI * 2); g.fill();
    } else if (type === "mystery") {
      g.font = "bold 64px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("?", 64, 68);
    }
    return c;
  }

  // Water bubble, in two layers: the body (behind the icon) and the shine (in front of it)
  function bubbleCanvas(front) {
    const S = 256, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), r = 118;
    if (!front) {
      const body = g.createRadialGradient(128, 128, 20, 128, 128, r);
      body.addColorStop(0, "rgba(150,215,255,0.05)");
      body.addColorStop(0.7, "rgba(120,200,255,0.12)");
      body.addColorStop(0.92, "rgba(140,215,255,0.35)");
      body.addColorStop(1, "rgba(200,240,255,0)");
      g.fillStyle = body; g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3; g.strokeStyle = "rgba(210,245,255,0.75)";
      g.beginPath(); g.arc(128, 128, r - 3, 0, Math.PI * 2); g.stroke();
      return c;
    }
    // Rainbow sheen around the rim, like a soap or water bubble
    [["rgba(120,255,240,0.45)", -0.3, 1.1], ["rgba(255,140,230,0.4)", 1.0, 1.0], ["rgba(255,230,120,0.35)", 2.2, 0.9], ["rgba(140,170,255,0.4)", 3.3, 1.3]]
      .forEach(([col, a0, len]) => { g.lineWidth = 7; g.strokeStyle = col; g.beginPath(); g.arc(128, 128, r - 9, a0, a0 + len); g.stroke(); });
    // Highlights
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath(); g.ellipse(88, 74, 30, 16, -0.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.beginPath(); g.arc(178, 184, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 4;
    g.beginPath(); g.arc(128, 128, r - 18, 2.3, 2.9); g.stroke();
    return c;
  }

  function stardustCanvas() {
    const S = 64, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,240,200,0.9)"); glow.addColorStop(0.35, "rgba(255,200,100,0.35)"); glow.addColorStop(1, "rgba(255,180,80,0)");
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    g.fillStyle = "#fff6dc";
    g.beginPath(); g.moveTo(32, 10); g.lineTo(38, 32); g.lineTo(32, 54); g.lineTo(26, 32); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(14, 32); g.lineTo(32, 27); g.lineTo(50, 32); g.lineTo(32, 37); g.closePath(); g.fill();
    return c;
  }

  function hornCanvas() {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const glow = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    glow.addColorStop(0, "rgba(255,215,90,0.7)"); glow.addColorStop(1, "rgba(255,190,60,0)");
    g.fillStyle = glow; g.fillRect(0, 0, S, S);
    // A curved golden horn
    const grad = g.createLinearGradient(30, 100, 90, 20);
    grad.addColorStop(0, "#a8660c"); grad.addColorStop(0.5, "#ffd45a"); grad.addColorStop(1, "#fff1b8");
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(38, 104); g.quadraticCurveTo(30, 52, 86, 22); g.quadraticCurveTo(58, 62, 66, 104); g.closePath(); g.fill();
    g.strokeStyle = "#7a4a08"; g.lineWidth = 3; g.stroke();
    return c;
  }

  // ---------- Pickup system ----------
  // api: { player() -> Vector3, hitOffsetY, boundX, boundY, spawnZ, despawnZ, nova(), sparkle(pos, colorHex) }
  function create(scene, api) {
    const tex = c => new THREE.CanvasTexture(c);
    const symbols = {}, iconUrls = {};
    Object.keys(TYPES).forEach(t => { symbols[t] = tex(iconCanvas(t, false)); iconUrls[t] = iconCanvas(t, true).toDataURL(); });
    const bubbleBack = tex(bubbleCanvas(false)), bubbleFront = tex(bubbleCanvas(true));
    const BUBBLE = 3.0, SYMBOL = 2.1;
    let pops = [];
    const dustTex = tex(stardustCanvas()), hornTex = tex(hornCanvas());

    let items = [];
    const active = {}, activeMax = {};
    let lives = 0, meter = 0, runDust = 0, revive = 0;
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

    const spriteOf = (map, size) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }));
      sp.scale.set(size, size, 1);
      return sp;
    };

    function addItem(kind, type, x, y, z) {
      let sprite, parts = null;
      if (kind === "power") {
        // Power-ups float inside a water bubble: body behind, symbol in the middle, shine in front
        sprite = new THREE.Group();
        parts = { back: spriteOf(bubbleBack, BUBBLE), icon: spriteOf(symbols[type], SYMBOL), front: spriteOf(bubbleFront, BUBBLE) };
        parts.back.position.z = -0.05; parts.front.position.z = 0.05;
        sprite.add(parts.back, parts.icon, parts.front);
      } else {
        sprite = spriteOf(kind === "horn" ? hornTex : dustTex, kind === "horn" ? 2.4 : 1.1);
      }
      sprite.position.set(x, y, z);
      scene.add(sprite);
      const item = { kind, type, sprite, parts, baseY: y, phase: Math.random() * 6, size: kind === "horn" ? 2.4 : 1.1 };
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
      return addItem("power", type, rand(-api.boundX + 0.5, api.boundX - 0.5), rand(-api.boundY + 0.5, api.boundY - 0.5) + api.hitOffsetY, api.spawnZ());
    }

    function addStardust(n) {
      runDust += n;
      meter += n;
      let gained = false;
      while (meter >= P.stardustPerLife && lives < P.maxLives) { meter -= P.stardustPerLife; lives++; gained = true; }
      if (lives >= P.maxLives) meter = Math.min(meter, P.stardustPerLife);
      if (gained) popup("EXTRA LIFE", "#6ee7a8");
    }

    function activate(type, zoneId, fromMystery) {
      if (type === "mystery") {
        const pool = allowedTypes(zoneId, []).filter(t => t !== "mystery");
        return activate(pickType(pool), zoneId, true);
      }
      const label = (fromMystery ? "MYSTERY: " : "") + TYPES[type].name;
      if (type === "nova") { api.nova(); popup(label, TYPES.nova.color); return type; }
      const extending = (active[type] || 0) > 0;
      active[type] = (extending ? active[type] : 0) + TYPES[type].seconds;
      activeMax[type] = active[type];
      popup(label + (extending ? " +" + TYPES[type].seconds + "s" : ""), TYPES[type].color);
      return type;
    }

    function collect(item, zoneId) {
      if (item.kind === "stardust") { addStardust(1); api.sparkle(item.sprite.position, 0xffd27a); }
      else if (item.kind === "horn") { addStardust(P.hornStardust); popup("GOLDEN HORN +" + P.hornStardust, "#ffd45a"); api.sparkle(item.sprite.position, 0xffd45a); }
      else {
        activate(item.type, zoneId);
        // The bubble pops: an expanding ring plus a splash of droplets
        const ring = spriteOf(bubbleBack, BUBBLE);
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
      nextDust = P.firstAt; nextPower = P.firstAt + rand(0, 3); nextHorn = P.firstAt + rand(30, 60);
      popTimer = 0; hud.pop.style.opacity = 0;
      updateHud();
    }

    let lastHud = "";
    function updateHud() {
      const key = runDust + "|" + meter + "|" + lives;
      if (key !== lastHud) {
        lastHud = key;
        hud.dust.textContent = (lives >= P.maxLives ? "MAX" : meter + "/" + P.stardustPerLife);
        hud.bar.style.width = (Math.min(1, meter / P.stardustPerLife) * 100) + "%";
        hud.lives.textContent = lives;
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
      } else if (item.kind === "horn") {
        if (!item.homing) s.position.y = item.baseY + Math.sin(t * 2.2) * 0.2;
        s.material.rotation = Math.sin(t * 2) * 0.3;
        s.scale.setScalar(item.size * (1 + Math.sin(t * 4) * 0.08));
      } else {
        s.material.rotation += dt * 2.5;
        s.scale.setScalar(item.size * (1 + Math.sin(t * 9) * 0.25));
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
        if (item.homing) {
          const k = Math.min(1, dt * 9);
          s.x += (p.x - s.x) * k; s.y += (py - s.y) * k; s.z += (p.z - s.z) * k;
        } else {
          s.z += speed * dt;
        }
        animate(item, now, dt);
        const r = item.kind === "power" ? 1.4 : item.kind === "horn" ? 1.3 : 1.0;
        if (playing && Math.hypot(s.x - p.x, s.y - py, s.z - p.z) < r) { collect(item, zoneId); removeItem(item); return false; }
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
        if (lives <= 0) return false;
        lives--;
        revive = P.reviveSeconds;
        addStardust(0);
        popup("LIFE USED", "#6ee7a8");
        return true;
      },
      stats: () => ({ stardust: runDust, lives, meter }),
      // Test hooks
      _debug: {
        items: () => items, active, spawn: (kind, type, x, y, z) => addItem(kind, type, x, y, z),
        addStardust, setNext(d, pw, h) { nextDust = d; nextPower = pw; nextHorn = h; }, spawnPower,
      },
    };
  }

  root.ChogPickups = { create, TYPES, allowedTypes, pickType };
})(window);
