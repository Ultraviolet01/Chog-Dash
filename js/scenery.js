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

  // A face-on spiral galaxy: warm core, two star-filled arms turning blue toward the edge
  function galaxyCanvas() {
    const S = 1024, c = document.createElement("canvas"), R = seeded(21);
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.translate(S / 2, S / 2);
    g.globalCompositeOperation = "lighter";
    const glow = (x, y, r, rgb, a) => {
      const b = g.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, "rgba(" + rgb + "," + a + ")"); b.addColorStop(1, "rgba(" + rgb + ",0)");
      g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    // Arms: soft glow first, then individual stars
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 260; i++) {
        const t = Math.pow(R(), 0.8) * 3.6 * Math.PI, r = 40 + t * 38;
        const a = t + arm * Math.PI + (R() - 0.5) * 0.35;
        const out = r / 480;
        glow(Math.cos(a) * r, Math.sin(a) * r, 30 + R() * 50, out < 0.5 ? "255,215,170" : "150,180,255", 0.05);
      }
      for (let i = 0; i < 2600; i++) {
        const t = Math.pow(R(), 0.8) * 3.6 * Math.PI, r = 40 + t * 38;
        const spread = 10 + r * 0.12;
        const a = t + arm * Math.PI;
        const x = Math.cos(a) * r + (R() - 0.5) * spread * 2, y = Math.sin(a) * r + (R() - 0.5) * spread * 2;
        const out = Math.min(1, r / 480);
        const col = [Math.round(255 - 90 * out), Math.round(235 - 40 * out), Math.round(200 + 55 * out)].join(",");
        g.fillStyle = "rgba(" + col + "," + (0.25 + R() * 0.6) + ")";
        const sz = R() < 0.92 ? 1.5 : 3;
        g.fillRect(x, y, sz, sz);
      }
    }
    // Bright core
    glow(0, 0, 220, "255,200,140", 0.35);
    glow(0, 0, 90, "255,240,210", 0.9);
    glow(0, 0, 30, "255,255,255", 1);
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

  // ---------- Zone looks (blended smoothly when the zone changes) ----------
  // fogNear/fogFar also change how far ahead obstacles can be seen.
  const LOOKS = {
    outer: { back: 0xc8c8d8, fog: 0x05061a, fogNear: 90, fogFar: 250, ambient: 0x6070b0, rim: 0x8a5cff, fill: 0x3b7bff,
      clouds: [0x2f5bff, 0x7a46ff, 0x3aa0ff, 0x9a4dff], cloudGain: 1, streak: [0.75, 0.82, 1], hole: 1, belt: false, galaxy: 0 },
    belt: { back: 0xa08a70, fog: 0x0b0907, fogNear: 90, fogFar: 250, ambient: 0x8a7a6a, rim: 0xc89a6a, fill: 0x6a6aa0,
      clouds: [0x7a6650, 0x5a5466, 0x8a7058], cloudGain: 0.7, streak: [1, 0.9, 0.75], hole: 0.8, belt: true, galaxy: 0 },
    drift: { back: 0x8cf0ff, fog: 0x03101c, fogNear: 90, fogFar: 250, ambient: 0x4a9ac0, rim: 0x3ad0ff, fill: 0x2f6bff,
      clouds: [0x2fd0ff, 0x3a8aff, 0x40e0c0], cloudGain: 2.0, streak: [0.6, 1, 1], hole: 0.9, belt: false, galaxy: 0 },
    deep: { back: 0x5a4a88, fog: 0x08041a, fogNear: 55, fogFar: 175, ambient: 0x6a50a0, rim: 0xb04cff, fill: 0x5a3bff,
      clouds: [0x7a2fff, 0xb04cff, 0x4a1a9a], cloudGain: 0.9, streak: [0.85, 0.65, 1], hole: 1.7, belt: false, galaxy: 0 },
    // Breaking out of the deep zone to see the whole Milky Way spiral ahead
    milky: { back: 0xe0d2c0, fog: 0x0a0812, fogNear: 90, fogFar: 250, ambient: 0xa09080, rim: 0xffc878, fill: 0x8a9aff,
      clouds: [0xffd8a0, 0xfff0d0, 0xa0b0ff], cloudGain: 1.3, streak: [1, 0.95, 0.8], hole: 0.45, belt: false, galaxy: 1 },
  };

  // Accent colour of each zone, used for its warp gate and the flash when entering it
  const ACCENTS = { outer: 0x7a8cff, belt: 0xd8a46a, drift: 0x3ad0ff, deep: 0xb04cff, milky: 0xffd27a };

  // Swirling glow for the inside of a warp gate (white, tinted per zone)
  function gateCanvas() {
    const S = 512, c = document.createElement("canvas"), R = seeded(31);
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.translate(S / 2, S / 2);
    const edge = g.createRadialGradient(0, 0, 120, 0, 0, 250);
    edge.addColorStop(0, "rgba(255,255,255,0)"); edge.addColorStop(0.75, "rgba(255,255,255,0.18)"); edge.addColorStop(1, "rgba(255,255,255,0.55)");
    g.fillStyle = edge; g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const r = 140 + R() * 105, a = R() * Math.PI * 2;
      g.strokeStyle = "rgba(255,255,255," + (0.08 + R() * 0.2) + ")"; g.lineWidth = 1 + R() * 3;
      g.beginPath(); g.arc(0, 0, r, a, a + 0.4 + R() * 0.9); g.stroke();
    }
    return c;
  }
  let gateTex = null;

  // A huge glowing ring the rocket flies through when it enters a new zone
  function makeGate(zoneId) {
    const color = ACCENTS[zoneId] || 0xffffff;
    if (!gateTex) gateTex = new THREE.CanvasTexture(gateCanvas());
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false };
    const gate = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.45, 16, 72), new THREE.MeshBasicMaterial(Object.assign({ color }, add)));
    const halo = new THREE.Mesh(new THREE.TorusGeometry(10, 1.4, 12, 72), new THREE.MeshBasicMaterial(Object.assign({ color, opacity: 0.25 }, add)));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.12, 8, 72), new THREE.MeshBasicMaterial(Object.assign({ color: 0xffffff, opacity: 0.7 }, add)));
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshBasicMaterial(Object.assign({ map: gateTex, color, opacity: 0.9, side: THREE.DoubleSide }, add)));
    gate.add(halo, ring, inner, swirl);
    gate.userData = { ring, inner, swirl };
    return gate;
  }

  // ---------- Scenery ----------
  // lights: { ambient, rim, fill } so each zone can recolour the lighting
  function create(scene, dotTex, lights) {
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

    // Milky Way spiral, seen at an angle; only visible in the Milky Way zone
    const galaxyMat = new THREE.MeshBasicMaterial({ map: tex(galaxyCanvas()), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
    const galaxy = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), galaxyMat);
    galaxy.position.set(380, 140, BACK_Z + 20);
    galaxy.rotation.set(-1.05, 0.25, 0.4);
    galaxy.renderOrder = -1;
    galaxy.visible = false;
    scene.add(galaxy);

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
    const clouds = [];
    let look = LOOKS.outer;
    function placeCloud(c, z) {
      const side = Math.random() < 0.5 ? -1 : 1;
      c.position.set(side * rand(70, 150), rand(-60, 70), z);
      const s = rand(160, 300);
      c.scale.set(s, s * rand(0.6, 1), 1);
      c.material.color.setHex(look.clouds[Math.floor(Math.random() * look.clouds.length)]);
      c.material.opacity = rand(0.18, 0.32) * look.cloudGain;
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

    // Asteroid Belt: rock fields streaming past on both sides, outside the play area
    const BELT = 150;
    const beltGeo = new THREE.IcosahedronGeometry(1, 0);
    const beltRocks = new THREE.InstancedMesh(beltGeo,
      new THREE.MeshStandardMaterial({ color: 0x6e6660, roughness: 1, flatShading: true }), BELT);
    const belt = [];
    const PARKED = -10000;
    for (let i = 0; i < BELT; i++) belt.push({ x: 0, y: PARKED, z: rand(-420, 10), s: 1, rx: rand(0, 6), ry: rand(0, 6), spin: rand(-1, 1) });
    function placeBeltRock(b) {
      const side = Math.random() < 0.5 ? -1 : 1;
      b.x = side * rand(15, 75);
      b.y = rand(-35, 30);
      b.s = rand(0.8, 4.5) * (Math.abs(b.x) > 40 ? 1.6 : 1);
    }
    scene.add(beltRocks);
    const tmpObj = new THREE.Object3D();

    // Current blended values, moving toward the active zone's look
    const cur = {
      back: new THREE.Color(look.back), fog: new THREE.Color(look.fog), ambient: new THREE.Color(look.ambient),
      rim: new THREE.Color(look.rim), fill: new THREE.Color(look.fill), fogNear: look.fogNear, fogFar: look.fogFar,
      streak: look.streak.slice(), hole: look.hole, galaxy: look.galaxy,
    };
    const tmpColor = new THREE.Color();
    function applyLook(k) {
      ["back", "fog", "ambient", "rim", "fill"].forEach(key => cur[key].lerp(tmpColor.setHex(look[key]), k));
      cur.fogNear += (look.fogNear - cur.fogNear) * k;
      cur.fogFar += (look.fogFar - cur.fogFar) * k;
      cur.hole += (look.hole - cur.hole) * k;
      cur.galaxy += (look.galaxy - cur.galaxy) * k;
      galaxyMat.opacity = cur.galaxy;
      galaxy.visible = cur.galaxy > 0.01;
      for (let j = 0; j < 3; j++) cur.streak[j] += (look.streak[j] - cur.streak[j]) * k;
      backdrop.material.color.copy(cur.back);
      scene.fog.color.copy(cur.fog);
      scene.background.copy(cur.fog).multiplyScalar(0.8);
      // Fog recedes as speed rises, so obstacles spawned further ahead are visible in time
      scene.fog.near = cur.fogNear * fogScale;
      scene.fog.far = cur.fogFar * fogScale;
      if (lights) { lights.ambient.color.copy(cur.ambient); lights.rim.color.copy(cur.rim); lights.fill.color.copy(cur.fill); }
      hole.scale.setScalar(cur.hole);
    }

    // fast: switch in about a second (crossing a warp gate); otherwise blend over about 3 seconds
    let blendRate = 0.9;
    function setZone(id, instant, fast) {
      look = LOOKS[id] || LOOKS.outer;
      if (fast) {
        blendRate = 4;
        clouds.forEach(c => placeCloud(c, c.position.z));   // new zone colours straight away
      }
      if (instant) {
        applyLook(1);
        clouds.forEach(c => placeCloud(c, c.position.z));
        if (!look.belt) belt.forEach(b => { b.y = PARKED; });
      }
    }

    let fogScale = 1;
    function update(dt, speed, maxSpeed) {
      fogScale = Math.min(3.5, Math.max(1, speed / maxSpeed));
      applyLook(1 - Math.exp(-dt * blendRate));
      blendRate += (0.9 - blendRate) * Math.min(1, dt * 0.6);

      // Belt rocks move with the world; new ones only appear while in the belt
      for (let i = 0; i < BELT; i++) {
        const b = belt[i];
        b.z += speed * dt;
        b.rx += b.spin * dt; b.ry += b.spin * 0.7 * dt;
        if (b.z > 15) {
          b.z -= 430;
          if (look.belt) placeBeltRock(b); else b.y = PARKED;
        }
        tmpObj.position.set(b.x, b.y, b.z);
        tmpObj.rotation.set(b.rx, b.ry, 0);
        tmpObj.scale.setScalar(b.y === PARKED ? 0.0001 : b.s);
        tmpObj.updateMatrix();
        beltRocks.setMatrixAt(i, tmpObj.matrix);
      }
      beltRocks.instanceMatrix.needsUpdate = true;

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
        sCol[i * 6] = cur.streak[0] * bright; sCol[i * 6 + 1] = cur.streak[1] * bright; sCol[i * 6 + 2] = cur.streak[2] * bright;
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
      if (galaxy.visible) galaxy.rotateZ(dt * 0.02);

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

    return { update, setZone, warp() { warp = 1; }, makeGate, accent: id => ACCENTS[id] || 0xffffff };
  }

  root.ChogScenery = { create };
})(window);
