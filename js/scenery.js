/*
 * Space scenery, all generated in code (no image or video files):
 * - a far backdrop with blue and violet nebula and a dark, clear centre so obstacles stay readable
 * - a slowly spinning black hole in the upper left
 * - streaming stars, warp streaks that grow with speed (and burst when a run starts)
 * - nebula clouds drifting past at the edges, and the occasional meteor far away
 * Art direction follows the reference images supplied for the project; nothing is copied from them.
 */
(function (root) {
  // Small seeded random generator, so the backdrop looks the same every time
  function seeded(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Canvas painters ----------
  function backdropCanvas() {
    const W = 2048, H = 1024, R = seeded(7);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#05061a"); grad.addColorStop(0.5, "#04050f"); grad.addColorStop(1, "#060719");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    const blob = (x, y, r, rgb, a) => {
      const b = g.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, "rgba(" + rgb + "," + a + ")");
      b.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = b;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    // A nebula band: many soft blobs scattered along a curve
    const band = (pts, spread, colors, count, size) => {
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < count; i++) {
        const t = R() * (pts.length - 1), k = Math.floor(t), f = t - k;
        const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + (R() - 0.5) * spread;
        const y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + (R() - 0.5) * spread;
        blob(x, y, size * (0.3 + R()), colors[Math.floor(R() * colors.length)], 0.025 + R() * 0.06);
      }
      // Dark dust lanes give the clouds structure
      g.globalCompositeOperation = "source-over";
      for (let i = 0; i < count / 4; i++) {
        const t = R() * (pts.length - 1), k = Math.floor(t), f = t - k;
        const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + (R() - 0.5) * spread;
        const y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + (R() - 0.5) * spread;
        blob(x, y, size * (0.15 + R() * 0.4), "4,5,15", 0.18 + R() * 0.2);
      }
    };
    const BLUE = "40,80,255", VIOLET = "120,60,255", CYAN = "60,170,255", MAGENTA = "170,70,255";
    // The camera sees roughly the middle 60-70% of this canvas; features sit inside that window, centre left dark
    band([[420, 560], [560, 700], [760, 830], [980, 900]], 170, [BLUE, CYAN, VIOLET], 260, 130);    // lower left
    band([[1560, 240], [1640, 420], [1620, 620], [1520, 820]], 160, [BLUE, VIOLET, CYAN], 220, 120); // right
    band([[480, 200], [640, 260], [820, 330]], 140, [VIOLET, BLUE, MAGENTA], 160, 110);            // around the black hole
    band([[1400, 860], [1600, 900], [1750, 820]], 120, [MAGENTA, VIOLET], 90, 100);                // lower right glow
    // Keep the centre clear
    g.globalCompositeOperation = "source-over";
    blob(1024, 512, 420, "4,5,15", 0.55);

    // Faint star dust and a few bright stars with glints
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2600; i++) {
      const a = 0.15 + R() * 0.5;
      g.fillStyle = "rgba(" + (R() < 0.3 ? "170,150,255" : "200,215,255") + "," + a + ")";
      g.fillRect(R() * W, R() * H, R() < 0.9 ? 1 : 2, R() < 0.9 ? 1 : 2);
    }
    for (let i = 0; i < 26; i++) {
      const x = 300 + R() * 1450, y = 120 + R() * 780, s = 4 + R() * 10;
      const col = R() < 0.5 ? "150,170,255" : "190,140,255";
      blob(x, y, s, col, 0.8);
      g.strokeStyle = "rgba(" + col + ",0.5)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - s * 2, y); g.lineTo(x + s * 2, y); g.moveTo(x, y - s * 2); g.lineTo(x, y + s * 2); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
    return c;
  }

  function blackHoleCanvas() {
    const S = 512, c = document.createElement("canvas"), R = seeded(11);
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.translate(S / 2, S / 2);
    g.globalCompositeOperation = "lighter";
    // Accretion swirl: many thin arcs spiralling in
    for (let i = 0; i < 220; i++) {
      const r = 70 + Math.pow(R(), 1.6) * 170;
      const start = R() * Math.PI * 2, len = 0.6 + R() * 1.8;
      const col = R() < 0.45 ? "90,130,255" : R() < 0.7 ? "150,90,255" : "200,225,255";
      g.strokeStyle = "rgba(" + col + "," + (0.05 + (1 - (r - 70) / 170) * 0.25) + ")";
      g.lineWidth = 1 + R() * 4;
      g.beginPath();
      g.ellipse(0, 0, r, r * 0.92, 0, start, start + len);
      g.stroke();
    }
    const glow = g.createRadialGradient(0, 0, 60, 0, 0, 130);
    glow.addColorStop(0, "rgba(140,170,255,0.55)"); glow.addColorStop(1, "rgba(80,60,255,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(0, 0, 130, 0, Math.PI * 2); g.fill();
    // Event horizon and photon ring
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#000";
    g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(210,225,255,0.85)"; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 68, 0, Math.PI * 2); g.stroke();
    return c;
  }

  function cloudCanvas(seed) {
    const S = 256, c = document.createElement("canvas"), R = seeded(seed);
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 40; i++) {
      const x = S / 2 + (R() - 0.5) * S * 0.55, y = S / 2 + (R() - 0.5) * S * 0.55, r = 20 + R() * 70;
      const b = g.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, "rgba(255,255,255," + (0.05 + R() * 0.08) + ")");
      b.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = b;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  function meteorCanvas() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 16;
    const g = c.getContext("2d");
    const tail = g.createLinearGradient(0, 0, 256, 0);
    tail.addColorStop(0, "rgba(255,140,60,0)"); tail.addColorStop(0.8, "rgba(255,190,120,0.7)"); tail.addColorStop(1, "rgba(255,245,220,1)");
    g.fillStyle = tail;
    g.fillRect(0, 6, 256, 4);
    const head = g.createRadialGradient(248, 8, 0, 248, 8, 8);
    head.addColorStop(0, "rgba(255,255,255,1)"); head.addColorStop(1, "rgba(255,200,140,0)");
    g.fillStyle = head;
    g.fillRect(232, 0, 24, 16);
    return c;
  }

  // ---------- Scenery ----------
  function create(scene, dotTex) {
    const rand = (a, b) => a + Math.random() * (b - a);
    const tex = c => new THREE.CanvasTexture(c);

    // Far backdrop and black hole
    const BACK_Z = -950;
    // Sized well past the edges of the view; slightly dimmed so obstacles stand out against it
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(4600, 2400),
      new THREE.MeshBasicMaterial({ map: tex(backdropCanvas()), color: 0xc8c8d8, fog: false, depthWrite: false }));
    backdrop.position.set(0, 40, BACK_Z);
    backdrop.renderOrder = -2;
    scene.add(backdrop);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(330, 330),
      new THREE.MeshBasicMaterial({ map: tex(blackHoleCanvas()), transparent: true, fog: false, depthWrite: false }));
    hole.position.set(-700, 330, BACK_Z + 5);
    hole.renderOrder = -1;
    scene.add(hole);

    // Streaming stars, a few tinted blue and violet
    const STARS = 1400;
    const starPos = new Float32Array(STARS * 3), starCol = new Float32Array(STARS * 3);
    const tints = [[1, 1, 1], [0.75, 0.82, 1], [0.8, 0.7, 1]];
    for (let i = 0; i < STARS; i++) {
      starPos[i * 3] = rand(-120, 120); starPos[i * 3 + 1] = rand(-80, 80); starPos[i * 3 + 2] = rand(-400, 20);
      const t = tints[Math.floor(Math.random() * tints.length)];
      starCol[i * 3] = t[0]; starCol[i * 3 + 1] = t[1]; starCol[i * 3 + 2] = t[2];
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.5, map: dotTex, vertexColors: true,
      fog: false, transparent: true, opacity: 0.9, depthWrite: false })));

    // Warp streaks: invisible at the starting speed, longer and brighter as speed rises
    const STREAKS = 220;
    const sPos = new Float32Array(STREAKS * 6), sCol = new Float32Array(STREAKS * 6), sBase = new Float32Array(STREAKS * 3);
    for (let i = 0; i < STREAKS; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(9, 90);
      sBase[i * 3] = Math.cos(a) * r; sBase[i * 3 + 1] = Math.sin(a) * r * 0.65; sBase[i * 3 + 2] = rand(-420, 0);
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    streakGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
    const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    streaks.frustumCulled = false;
    scene.add(streaks);
    let warp = 0;

    // Nebula clouds drifting past, kept to the edges of the view
    const cloudTex = [tex(cloudCanvas(3)), tex(cloudCanvas(5)), tex(cloudCanvas(9))];
    const cloudColors = [0x2f5bff, 0x7a46ff, 0x3aa0ff, 0x9a4dff];
    const clouds = [];
    function placeCloud(c, z) {
      const side = Math.random() < 0.5 ? -1 : 1;
      c.position.set(side * rand(70, 150), rand(-60, 70), z);
      const s = rand(160, 300);
      c.scale.set(s, s * rand(0.6, 1), 1);
      c.material.color.setHex(cloudColors[Math.floor(Math.random() * cloudColors.length)]);
      c.material.opacity = rand(0.18, 0.32);
    }
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex[i % 3], transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      placeCloud(c, -650 + i * 160);
      scene.add(c);
      clouds.push(c);
    }

    // Occasional far-away meteors
    const meteorMat = new THREE.MeshBasicMaterial({ map: tex(meteorCanvas()), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const meteor = new THREE.Mesh(new THREE.PlaneGeometry(90, 5), meteorMat);
    meteor.visible = false;
    scene.add(meteor);
    let meteorWait = rand(3, 6), meteorLife = 0;
    const meteorVel = new THREE.Vector2();

    function update(dt, speed, maxSpeed) {
      // Stars
      for (let i = 0; i < STARS; i++) {
        starPos[i * 3 + 2] += speed * dt;
        if (starPos[i * 3 + 2] > 20) { starPos[i * 3 + 2] -= 420; starPos[i * 3] = rand(-120, 120); starPos[i * 3 + 1] = rand(-80, 80); }
      }
      starGeo.attributes.position.needsUpdate = true;

      // Warp streaks
      warp = Math.max(0, warp - dt / 1.3);
      const fast = Math.max(0, (speed - 50) / Math.max(1, maxSpeed - 50));
      const bright = Math.min(1, fast * 0.6 + warp);
      const len = 4 + speed * 0.12 + warp * 70;
      for (let i = 0; i < STREAKS; i++) {
        let z = sBase[i * 3 + 2] + (speed * 1.6 + warp * 400) * dt;
        if (z - len > 10) z -= 430;
        sBase[i * 3 + 2] = z;
        const x = sBase[i * 3], y = sBase[i * 3 + 1];
        sPos[i * 6] = x; sPos[i * 6 + 1] = y; sPos[i * 6 + 2] = z;
        sPos[i * 6 + 3] = x; sPos[i * 6 + 4] = y; sPos[i * 6 + 5] = z - len;
        sCol[i * 6] = 0.75 * bright; sCol[i * 6 + 1] = 0.82 * bright; sCol[i * 6 + 2] = bright;
        sCol[i * 6 + 3] = sCol[i * 6 + 4] = sCol[i * 6 + 5] = 0;
      }
      streakGeo.attributes.position.needsUpdate = true;
      streakGeo.attributes.color.needsUpdate = true;

      // Clouds drift toward the camera and recycle before they fill the screen
      clouds.forEach(c => {
        c.position.z += (speed * 0.35 + 6) * dt;
        if (c.position.z > -180) placeCloud(c, -700);
      });

      // Black hole spins slowly
      hole.rotation.z += dt * 0.12;

      // Meteors
      if (meteorLife > 0) {
        meteorLife -= dt;
        meteor.position.x += meteorVel.x * dt;
        meteor.position.y += meteorVel.y * dt;
        meteorMat.opacity = Math.min(1, meteorLife * 3);
        if (meteorLife <= 0) meteor.visible = false;
      } else if ((meteorWait -= dt) <= 0) {
        meteorWait = rand(4, 9);
        meteorLife = 1.4;
        const dir = Math.random() < 0.5 ? -1 : 1;
        meteor.position.set(-dir * rand(150, 380), rand(120, 260), -600);
        meteorVel.set(dir * rand(260, 380), -rand(120, 200));
        meteor.rotation.z = Math.atan2(meteorVel.y, meteorVel.x);
        meteor.visible = true;
      }
    }

    return { update, warp() { warp = 1; } };
  }

  root.ChogScenery = { create };
})(window);
