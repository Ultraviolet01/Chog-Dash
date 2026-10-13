/*
 * Chog Dash game: a rider on a rocket dodging asteroids and debris in open space.
 * Rendering and gameplay only. Menus, wallet and leaderboard live in js/ui.js.
 *
 * States: "menu" (background only) -> "ready" -> "playing" -> "dead" -> "ready" ...
 */
(function (root) {
  const G = root.ChogConfig.game;

  // ---------- Tuning (change these to adjust the feel) ----------
  const BOUND_X = 7, BOUND_Y = 4.2;   // play area half-width and half-height
  const HIT_R = 0.6;                  // player hitbox radius (smaller than the visible rocket + rider)
  const HIT_OFFSET_Y = 0.35;          // hitbox centre, above the rocket's middle
  const STEER_SPEED = 14;             // max sideways speed (keyboard)
  const STEER_ACCEL = 70;
  const POINTER_SPEED_X = 20, POINTER_SPEED_Y = 16;   // mouse/touch: faster, so the rocket keeps up with the pointer
  const POINTER_ACCEL = 140, POINTER_GAIN = 9;
  const MAX_UP = 10;                  // max up/down speed (keyboard)
  const NEAR_MISS_MARGIN = 1.3;       // extra distance that still counts as a near miss

  const SPAWN_Z = -260, DESPAWN_Z = 12;
  const START_SPACING = 30, MIN_SPACING = 11, SPACING_SHRINK = 0.012;
  const CLUSTER_START = 120, TRIPLE_START = 400;
  const SAFE_MARGIN = 1.2;

  // Obstacle mix per zone (zones and their lengths are in js/config.js). Every zone keeps the safe path.
  const ZONE_RULES = {
    outer: { rock: 0.55, huge: 0.15, drift: 1.5, rockDrift: 0 },     // balanced mix
    belt: { rock: 0.92, huge: 0.3, drift: 1.0, rockDrift: 0.3 },     // nearly all asteroids, more huge ones
    drift: { rock: 0.3, huge: 0.08, drift: 4.5, rockDrift: 1.5 },    // mostly debris, drifting hard sideways
    deep: { rock: 0.6, huge: 0.2, drift: 2.0, rockDrift: 0.5 },      // shorter view distance (see js/scenery.js)
    milky: { rock: 0.5, huge: 0.22, drift: 2.5, rockDrift: 0.8 },    // finale: everything moves, more huge rocks
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function init(hooks) {
    const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const $ = id => document.getElementById(id);
    const hud = {
      root: $("hud"), dist: $("dist"), score: $("score"), speed: $("speed"), mode: $("modeBadge"),
      laser: $("laserCount"), laserBox: $("laserBox"), near: $("nearMiss"),
      laserBtn: $("laserBtn"), zoneLabel: $("zoneLabel"), zoneBanner: $("zoneBanner"), flash: $("flash"),
    };

    // ---------- Renderer, scene, camera ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // Start at the screen's pixel density (max 1.5) and lower it if the frame rate drops
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(pixelRatio);
    renderer.domElement.id = "gameCanvas";
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04050f);
    scene.fog = new THREE.Fog(0x05061a, 90, 250);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1200);
    let baseCamZ = 7;

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // Pull the camera back on narrow screens so the whole flying area (and anything that can hit you) stays in view
      baseCamZ = Math.max(7, (BOUND_X + 1.2) / (Math.tan(THREE.MathUtils.degToRad(35)) * camera.aspect));
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    // Cool key light with blue and violet fills, to match the nebula
    const ambient = new THREE.AmbientLight(0x6070b0, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xe6ebff, 1.0);
    sun.position.set(5, 8, 6);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8a5cff, 0.9);
    rim.position.set(-4, -2, -10);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x3b7bff, 0.5);
    fill.position.set(-8, 2, 2);
    scene.add(fill);

    const dotTex = new THREE.CanvasTexture(root.ChogArt.dotCanvas());

    // ---------- Background: nebula backdrop, black hole, stars, warp streaks (js/scenery.js) ----------
    const scenery = root.ChogScenery.create(scene, dotTex, { ambient, rim, fill });

    // ---------- Player: rocket with a rider on top ----------
    const player = new THREE.Group();
    const rocket = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, metalness: 0.3, roughness: 0.45 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xff7a2f, metalness: 0.2, roughness: 0.5 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b3340, metalness: 0.6, roughness: 0.4 });

    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 2.2, 20), hullMat);
    hull.rotation.x = Math.PI / 2;                  // lies along z, nose toward -z
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.8, 20), trimMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.5;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.18, 20), trimMat);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.55;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.35, 16), darkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.z = 1.25;
    rocket.add(hull, nose, band, nozzle);
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.6), trimMat);
      const a = (k / 3) * Math.PI * 2 + Math.PI;    // one fin straight down, two angled up
      fin.position.set(Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.85);
      fin.rotation.z = -a;
      rocket.add(fin);
    }
    const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16), darkMat);
    saddle.position.set(0, 0.42, 0.15);
    rocket.add(saddle);

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.85 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 14), flameMat);
    flame.rotation.x = Math.PI / 2;                 // tip points back toward the camera
    rocket.add(flame);

    // Rider sprite always faces the camera, so the rider's face and traits stay readable
    const riderMat = new THREE.SpriteMaterial({ map: null, transparent: true });
    let riderTex = {};   // rider views, see setRiderCanvas
    const rider = new THREE.Sprite(riderMat);
    rider.scale.set(1.7, 1.7, 1);
    rider.position.set(0, 0.98, 0.15);
    player.add(rocket, rider);
    scene.add(player);
    setRiderCanvas(root.ChogArt.rookieCanvas(), { side: root.ChogArt.rookieSideCanvas(), back: root.ChogArt.rookieBackCanvas() });
    useRiderPose("side");

    // Rider views: front (portrait), side (home screen, rocket turned nose-left) and back (flying away
    // from the camera, looking where the rocket goes). Riders without side/back art (NFT portraits) use front.
    function setRiderCanvas(canvas, poses) {
      Object.values(riderTex).forEach(t => t.dispose());
      const front = new THREE.CanvasTexture(canvas);
      riderTex = { front, side: poses && poses.side ? new THREE.CanvasTexture(poses.side) : front,
        back: poses && poses.back ? new THREE.CanvasTexture(poses.back) : front };
      riderMat.map = null;
    }
    function useRiderPose(name) {
      const t = riderTex[name] || riderTex.front;
      if (riderMat.map !== t) { riderMat.map = t; riderMat.needsUpdate = true; }
    }

    // ---------- Exhaust particles (one pooled point cloud, drawn in a single call) ----------
    const EXHAUST = 60;
    const exPos = new Float32Array(EXHAUST * 3), exCol = new Float32Array(EXHAUST * 3);
    const exVel = new Float32Array(EXHAUST * 3), exLife = new Float32Array(EXHAUST), exMax = new Float32Array(EXHAUST);
    const exGeo = new THREE.BufferGeometry();
    exGeo.setAttribute("position", new THREE.BufferAttribute(exPos, 3));
    exGeo.setAttribute("color", new THREE.BufferAttribute(exCol, 3));
    const exPoints = new THREE.Points(exGeo, new THREE.PointsMaterial({ size: 0.35, map: dotTex, vertexColors: true,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    exPoints.frustumCulled = false;
    scene.add(exPoints);
    const nozzleWorld = new THREE.Vector3();
    let exhaustIdx = 0, emitAcc = 0;
    function emitExhaust(thrusting) {
      const i = exhaustIdx;
      exhaustIdx = (exhaustIdx + 1) % EXHAUST;
      nozzleWorld.set(0, 0, 1.45).applyMatrix4(rocket.matrixWorld);
      exPos[i * 3] = nozzleWorld.x; exPos[i * 3 + 1] = nozzleWorld.y; exPos[i * 3 + 2] = nozzleWorld.z;
      exVel[i * 3] = rand(-0.6, 0.6); exVel[i * 3 + 1] = rand(-0.6, 0.6) - (thrusting ? 1.2 : 0); exVel[i * 3 + 2] = rand(9, 13);
      exMax[i] = exLife[i] = rand(0.18, 0.28);
    }
    function updateExhaust(dt) {
      for (let i = 0; i < EXHAUST; i++) {
        if (exLife[i] <= 0) { exCol[i * 3] = exCol[i * 3 + 1] = exCol[i * 3 + 2] = 0; continue; }
        exLife[i] -= dt;
        exPos[i * 3] += exVel[i * 3] * dt; exPos[i * 3 + 1] += exVel[i * 3 + 1] * dt; exPos[i * 3 + 2] += exVel[i * 3 + 2] * dt;
        const k = Math.max(0, exLife[i] / exMax[i]) * 0.6;   // additive blending: darker = more transparent
        exCol[i * 3] = k; exCol[i * 3 + 1] = 0.72 * k; exCol[i * 3 + 2] = 0.3 * k;
      }
      exGeo.attributes.position.needsUpdate = true;
      exGeo.attributes.color.needsUpdate = true;
    }

    // ---------- Obstacle shapes ----------
    function makeRockGeo() {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const pos = g.attributes.position, bump = {};
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = x.toFixed(3) + "," + y.toFixed(3) + "," + z.toFixed(3);   // shared corners move together
        if (!(key in bump)) bump[key] = 0.8 + Math.random() * 0.4;
        const s = bump[key];
        pos.setXYZ(i, x * s, y * s * 0.85, z * s);
      }
      g.computeVertexNormals();
      return g;
    }
    const rockGeos = [makeRockGeo(), makeRockGeo(), makeRockGeo(), makeRockGeo()];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7f7b8c, roughness: 0.95, flatShading: true });
    const debris = {
      plate: { geo: new THREE.BoxGeometry(1.6, 1.6, 0.2), mat: new THREE.MeshStandardMaterial({ color: 0x7d8a99, metalness: 0.6, roughness: 0.4 }), r: 0.9 },
      tube: { geo: new THREE.CylinderGeometry(0.35, 0.35, 2.4, 12), mat: new THREE.MeshStandardMaterial({ color: 0xb07040, metalness: 0.4, roughness: 0.5 }), r: 1.0 },
      shard: { geo: new THREE.TetrahedronGeometry(0.9), mat: new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 0.3, roughness: 0.5, flatShading: true }), r: 0.7 },
    };
    const debrisKinds = Object.keys(debris);
    const bitGeo = new THREE.TetrahedronGeometry(0.12);

    // ---------- Laser beam visuals ----------
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.25,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const beams = new THREE.Group();
    [-0.14, 0.14].forEach(x => {
      const core = new THREE.Mesh(beamGeo, beamMat); core.scale.set(0.05, 1, 0.05); core.position.x = x;
      beams.add(core);
    });
    const glow = new THREE.Mesh(beamGeo, glowMat); glow.scale.set(G.laserRadius * 0.6, 1, G.laserRadius * 0.6);
    beams.add(glow);
    beams.rotation.x = Math.PI / 2;
    beams.visible = false;
    scene.add(beams);
    let beamLife = 0;

    // ---------- Pickups (js/pickups.js), Radar outlines, Dash ram glow ----------
    const radarMat = new THREE.MeshBasicMaterial({ color: 0x4fe0c5, wireframe: true, transparent: true, opacity: 0.6,
      fog: false, depthWrite: false });
    const ramGlow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb84d,
      transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    ramGlow.position.set(0, 0.1, -1.7);
    ramGlow.scale.set(1, 1, 1.6);
    ramGlow.visible = false;
    player.add(ramGlow);
    let flashTimer = 0;
    const sparkMats = {};
    const pickups = root.ChogPickups.create(scene, {
      player: () => player.position, hitOffsetY: HIT_OFFSET_Y, boundX: BOUND_X, boundY: BOUND_Y,
      spawnZ: SPAWN_Z, despawnZ: DESPAWN_Z,
      sparkle: (pos, color) => {
        if (!sparkMats[color]) sparkMats[color] = new THREE.MeshBasicMaterial({ color });
        burst(pos, [sparkMats[color]], 6, 3);
      },
      nova: () => {
        // Clear every small obstacle in view; huge asteroids stay
        obstacles.forEach(o => { if (!o.huge && o.mesh.position.z > -230) smash(o); });
        flashTimer = 0.5;
        shake = Math.max(shake, 0.2);
      },
    });

    // Destroy an obstacle with a burst of pieces (Dash, Nova, revive)
    function smash(o) {
      if (o.gone) return;
      o.gone = true;
      burst(o.mesh.position, [o.mesh.material], 10, 6);
      scene.remove(o.mesh);
    }

    // ---------- Input ----------
    const keys = {};
    let steerMode = "keys";
    const pointerTarget = { x: 0, y: 0 };
    let lastTouch = null;

    window.addEventListener("keydown", e => {
      if (state === "menu" || e.target.tagName === "INPUT") return;
      keys[e.code] = true;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(e.code)) steerMode = "keys";
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if ((e.code === "Space" || e.code === "Enter") && !e.repeat) onPress();
      if ((e.code === "KeyE" || e.code === "KeyL") && !e.repeat) fireLaser();
    });
    window.addEventListener("keyup", e => { keys[e.code] = false; });
    window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

    renderer.domElement.addEventListener("pointerdown", e => {
      if (state === "menu") return;
      if (e.pointerType !== "mouse") lastTouch = { x: e.clientX, y: e.clientY };
      onPress();
    });
    window.addEventListener("pointermove", e => {
      // The rocket follows the mouse: left/right and up/down
      if (e.pointerType === "mouse") {
        steerMode = "pointer";
        pointerTarget.x = (e.clientX / window.innerWidth * 2 - 1) * BOUND_X;
        pointerTarget.y = -(e.clientY / window.innerHeight * 2 - 1) * BOUND_Y;
      } else if (lastTouch) {
        // Touch steers by dragging (in any direction), so the finger doesn't cover the rider
        steerMode = "pointer";
        pointerTarget.x = clamp(pointerTarget.x + (e.clientX - lastTouch.x) / window.innerWidth * BOUND_X * 3, -BOUND_X, BOUND_X);
        pointerTarget.y = clamp(pointerTarget.y - (e.clientY - lastTouch.y) / window.innerHeight * BOUND_Y * 3, -BOUND_Y, BOUND_Y);
        lastTouch = { x: e.clientX, y: e.clientY };
      }
    });
    const release = () => { lastTouch = null; };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);

    hud.laserBtn.addEventListener("pointerdown", e => { e.stopPropagation(); fireLaser(); });

    // ---------- Run state ----------
    let state = "menu", deadAt = 0, runStartedAt = 0;
    let distance = 0, sinceSpawn = 0, nextSpacing = START_SPACING;
    let obstacles = [], bits = [];
    const vel = { x: 0, y: 0 };
    const safe = { x: 0, y: 0 };
    let shake = 0, idleY = 0, runTime = 0;
    let laserCharges = 0, laserUsed = 0, nearMisses = 0, nearTimer = 0;
    let setup = { laserCharges: 0, multiplier: 1, modeLabel: "", showScore: false };

    const meters = () => Math.floor(distance / G.unitsPerMeter);
    const baseSpeed = () => Math.min(G.baseSpeed + meters() * G.speedPerMeter, G.maxSpeed);
    const currentSpacing = () => Math.max(START_SPACING - meters() * SPACING_SHRINK, MIN_SPACING);

    function clearField() {
      obstacles.forEach(o => scene.remove(o.mesh));
      bits.forEach(b => scene.remove(b.mesh));
      obstacles = []; bits = [];
    }

    function toReady() {
      clearField();
      distance = 0; sinceSpawn = 0; nextSpacing = START_SPACING;
      vel.x = vel.y = 0; safe.x = safe.y = 0; pointerTarget.x = pointerTarget.y = 0;
      laserCharges = setup.laserCharges; laserUsed = 0; nearMisses = 0;
      runTime = 0;
      pickups.reset();
      zoneKey = null; bannerTimer = 0;
      hud.zoneBanner.style.opacity = 0;
      scenery.setZone("outer", true);
      player.position.z = 0;
      player.visible = true;
      state = "ready";
      updateHud(0);
      hud.root.style.display = "block";
      if (hooks.onReady) hooks.onReady();
    }

    function toMenu() {
      clearField();
      pickups.reset();
      state = "menu";
      player.position.z = 0;
      player.visible = true;
      hud.root.style.display = "none";
    }

    function start() {
      state = "playing";
      runStartedAt = performance.now();
      runTime = 0;
      scenery.warp();
      for (let z = -90; z > SPAWN_Z; z -= START_SPACING) spawnGroup(z);
      if (hooks.onStart) hooks.onStart();
    }

    function onPress() {
      if (state === "ready") start();
      else if (state === "dead" && performance.now() > deadAt + 600) toReady();
    }

    function burst(pos, mats, count, spread) {
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(bitGeo, mats[i % mats.length]);
        mesh.position.copy(pos);
        scene.add(mesh);
        bits.push({ mesh, v: new THREE.Vector3(rand(-spread, spread), rand(-spread, spread), rand(-spread, spread)), life: 0.9 });
      }
    }

    function die() {
      state = "dead";
      document.body.classList.remove("dashing", "slowmo");
      bannerTimer = 0;
      hud.zoneBanner.style.opacity = 0;
      deadAt = performance.now();
      shake = 0.35;
      player.visible = false;
      burst(player.position, [hullMat, trimMat], 28, 6);
      const m = meters();
      if (hooks.onEnd) hooks.onEnd({
        meters: m,
        durationMs: Math.round(deadAt - runStartedAt),
        score: root.ChogTraits.computeScore(m, setup.multiplier),
        laserUsed, nearMisses,
        stardust: pickups.stats().stardust,
      });
    }

    // ---------- Laser Eyes ----------
    function fireLaser() {
      if (state !== "playing" || laserCharges <= 0) return;
      laserCharges--;
      laserUsed++;
      const ox = player.position.x, oy = player.position.y + rider.position.y;
      // A huge asteroid in the path stops the beam; eligible obstacles in front of it are destroyed
      let stopZ = -G.laserRange;
      const inPath = o => {
        const dx = o.mesh.position.x - ox, dy = o.mesh.position.y - oy, r = G.laserRadius + o.hitR * 0.8;
        return o.mesh.position.z < 1 && o.mesh.position.z > -G.laserRange && dx * dx + dy * dy < r * r;
      };
      obstacles.forEach(o => { if (o.huge && inPath(o) && o.mesh.position.z > stopZ) stopZ = o.mesh.position.z; });
      obstacles = obstacles.filter(o => {
        if (!o.huge && inPath(o) && o.mesh.position.z > stopZ) {
          burst(o.mesh.position, [o.mesh.material], 10, 5);
          scene.remove(o.mesh);
          return false;
        }
        return true;
      });
      const len = Math.max(1, -stopZ - 0.3);
      beams.scale.set(1, len, 1);
      beams.position.set(ox, oy, -0.3 - len / 2);
      beams.visible = true;
      beamLife = 0.25;
      updateLaserHud();
    }

    function updateLaserHud() {
      const on = setup.laserCharges > 0;
      setDisplay(hud.laserBox, on);
      setDisplay(hud.laserBtn, on);
      setText(hud.laser, laserCharges + "/" + setup.laserCharges);
      if (hud.laserBtn.disabled !== (laserCharges <= 0)) hud.laserBtn.disabled = laserCharges <= 0;
    }

    // ---------- Obstacles ----------
    function makeObstacle(rules) {
      rules = rules || ZONE_RULES.outer;
      let mesh, hitR, vx = 0, vy = 0, huge = false;
      if (Math.random() < rules.rock) {
        huge = Math.random() < rules.huge;
        const s = huge ? rand(2.2, 2.8) : rand(0.9, 1.7);
        mesh = new THREE.Mesh(rockGeos[Math.floor(Math.random() * rockGeos.length)], rockMat);
        mesh.scale.setScalar(s);
        hitR = s * 0.9;
        if (rules.rockDrift && !huge) { vx = rand(-rules.rockDrift, rules.rockDrift); vy = rand(-rules.rockDrift, rules.rockDrift); }
      } else {
        const d = debris[debrisKinds[Math.floor(Math.random() * debrisKinds.length)]];
        const s = rand(0.9, 1.4);
        mesh = new THREE.Mesh(d.geo, d.mat);
        mesh.scale.setScalar(s);
        hitR = d.r * s;
        vx = rand(-rules.drift, rules.drift); vy = rand(-rules.drift, rules.drift);   // debris drifts
      }
      mesh.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
      const spin = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(vx ? 2 : 0.5);
      return { mesh, hitR, vx, vy, spin, huge, passed: false };
    }

    function spawnGroup(z) {
      const speed = baseSpeed();
      const spacing = nextSpacing;
      // Move the guaranteed-safe point no further than the rocket can travel before the group arrives
      const reach = (spacing / speed) * Math.min(STEER_SPEED, MAX_UP) * 0.7 + 1;
      safe.x = clamp(safe.x + rand(-reach, reach), -BOUND_X + 0.8, BOUND_X - 0.8);
      safe.y = clamp(safe.y + rand(-reach, reach), -BOUND_Y + 0.8, BOUND_Y - 0.8);

      const m = meters();
      let count = 1;
      if (m > CLUSTER_START && Math.random() < Math.min(0.6, (m - CLUSTER_START) / 500)) count = 2;
      if (m > TRIPLE_START && Math.random() < Math.min(0.4, (m - TRIPLE_START) / 800)) count = 3;

      const arrive = -z / speed;
      // Use the zone the group will be in when it reaches the rocket
      const rules = ZONE_RULES[root.ChogTraits.zoneAt(m + Math.floor(-z / G.unitsPerMeter)).zone.id] || ZONE_RULES.outer;
      for (let n = 0; n < count; n++) {
        const o = makeObstacle(rules);
        for (let t = 0; t < 8; t++) {
          let x, y;
          if (n === 0 && Math.random() < 0.35) { x = player.position.x + rand(-1, 1); y = player.position.y + HIT_OFFSET_Y + rand(-1, 1); }
          else { x = rand(-BOUND_X - 1, BOUND_X + 1); y = rand(-BOUND_Y - 1, BOUND_Y + 1); }
          const dx = x - safe.x, dy = y - (safe.y + HIT_OFFSET_Y), need = o.hitR + HIT_R + SAFE_MARGIN;
          if (dx * dx + dy * dy < need * need) continue;
          // (x, y) is where it will be on arrival; start it back along its drift
          o.mesh.position.set(x - o.vx * arrive, y - o.vy * arrive, z + rand(-3, 3));
          scene.add(o.mesh);
          obstacles.push(o);
          break;
        }
      }
      nextSpacing = currentSpacing() * rand(0.85, 1.2) * (count > 1 ? 1.3 : 1);
    }

    // ---------- Zones ----------
    let zoneKey = null, bannerTimer = 0;
    function zoneText(z) { return z.zone.name + (z.loop > 1 ? " · Loop " + z.loop : ""); }
    function checkZone() {
      const z = root.ChogTraits.zoneAt(meters());
      const key = z.index + ":" + z.loop;
      if (key === zoneKey) return;
      zoneKey = key;
      scenery.setZone(z.zone.id);
      hud.zoneBanner.innerHTML = "";
      const title = document.createElement("div"); title.textContent = z.zone.name.toUpperCase();
      const sub = document.createElement("div"); sub.className = "sub";
      sub.textContent = "Zone " + (z.index + 1) + " of " + G.zones.length + (z.loop > 1 ? " · Loop " + z.loop : "");
      hud.zoneBanner.append(title, sub);
      bannerTimer = 2.6;
    }

    // ---------- HUD ----------
    // Only touch the page when a value actually changes, to avoid layout work every frame
    function setText(el, text) { if (el._text !== text) { el._text = text; el.textContent = text; } }
    function setDisplay(el, on) { const v = on ? "block" : "none"; if (el._display !== v) { el._display = v; el.style.display = v; } }
    function updateHud(speed) {
      const m = meters();
      setText(hud.dist, m + " m");
      setText(hud.speed, "x" + ((speed || G.baseSpeed) / G.baseSpeed).toFixed(1));
      setText(hud.mode, setup.modeLabel);
      setText(hud.zoneLabel, zoneText(root.ChogTraits.zoneAt(m)));
      setDisplay(hud.score, setup.showScore);
      setText(hud.score, "Score " + root.ChogTraits.computeScore(m, setup.multiplier) +
        "  (" + m + " m x" + setup.multiplier.toFixed(2) + ")");
      updateLaserHud();
    }

    // ---------- Main loop ----------
    const clock = new THREE.Clock();
    const lookAt = new THREE.Vector3();

    function update(dt) {
      const now = performance.now();
      const playing = state === "playing";
      useRiderPose(state === "menu" ? "side" : "back");
      // Bigger flame while the rocket climbs (keyboard: holding rise; mouse/touch: moving up)
      const thrusting = playing && vel.y > 1;

      const speed = state === "dead" ? 0 : (playing ? baseSpeed() * pickups.speedFactor() : G.baseSpeed * 0.3);
      if (playing) runTime += dt;
      pickups.update(dt, speed, runTime, root.ChogTraits.zoneAt(meters()).zone.id, playing);
      const dashing = playing && pickups.dashing();
      document.body.classList.toggle("dashing", dashing);
      document.body.classList.toggle("slowmo", playing && pickups.slowed());
      if (flashTimer > 0) { flashTimer -= dt; hud.flash.style.opacity = Math.max(0, flashTimer / 0.5 * 0.8).toFixed(2); }

      scenery.update(dt, speed, G.maxSpeed);
      if (playing) checkZone();
      if (bannerTimer > 0) { bannerTimer -= dt; hud.zoneBanner.style.opacity = clamp(bannerTimer / 0.6, 0, 1).toFixed(2); }

      // Debris bits from crashes and laser hits
      bits = bits.filter(b => {
        b.life -= dt;
        b.mesh.position.addScaledVector(b.v, dt);
        b.mesh.rotation.x += dt * 5;
        b.mesh.scale.setScalar(Math.max(b.life, 0.01));
        if (b.life <= 0) { scene.remove(b.mesh); return false; }
        return true;
      });

      // Flame and exhaust: bigger while thrusting
      const power = state === "dead" ? 0 : (playing ? 0.55 + (thrusting ? 0.45 : 0) + (dashing ? 1.2 : 0) : 0.5);
      flameMat.color.setHex(dashing ? 0x4fd1c5 : 0xffb84d);
      ramGlow.visible = dashing;
      if (dashing) ramGlow.material.opacity = 0.25 + Math.random() * 0.15;
      // Blink while protected after using a life
      if (playing) player.visible = !pickups.reviving() || Math.floor(now / 90) % 2 === 0;
      const flameLen = power * rand(0.85, 1.15);
      flame.scale.set(0.7 + power * 0.4, flameLen * 1.4, 0.7 + power * 0.4);
      flame.position.z = 1.42 + 0.35 * flameLen * 1.4;
      flame.visible = state !== "dead";
      if (state !== "dead") {
        player.updateMatrixWorld();
        emitAcc += dt * (playing ? 45 + (thrusting ? 35 : 0) : 25);
        while (emitAcc >= 1) { emitAcc -= 1; emitExhaust(thrusting); }
      }
      updateExhaust(dt);

      // Laser beam fade
      if (beamLife > 0) {
        beamLife -= dt;
        beamMat.opacity = 0.9 * Math.max(0, beamLife / 0.25);
        glowMat.opacity = 0.25 * Math.max(0, beamLife / 0.25);
        if (beamLife <= 0) beams.visible = false;
      }

      if (state === "ready" || state === "menu") {
        // Home screen: the rider poses at the side (or lower down on tall screens), slowly turning to show off.
        // Ready screen: it glides back to the centre.
        const showcase = state === "menu", wide = camera.aspect >= 1;
        const tx = showcase && wide ? 2.6 : 0, ty = showcase ? (wide ? -0.3 : -2.3) : 0;
        const k = Math.min(1, dt * 3);
        player.position.x += (tx - player.position.x) * k;
        idleY += (ty - idleY) * k;
        player.position.y = idleY + Math.sin(now / 400) * 0.25;
        // Home screen: rocket turned side-on, nose pointing left, with a gentle sway
        player.rotation.set(Math.sin(now / 900) * 0.05, showcase ? 1.25 + Math.sin(now / 1700) * 0.15 : 0, Math.sin(now / 700) * 0.08);
      }

      if (playing) {
        const step = STEER_ACCEL * dt;
        if (steerMode === "keys") {
          // Keyboard: move while a key is held, stay put when released
          const tx = ((keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0)) * STEER_SPEED;
          const ty = ((keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0)) * MAX_UP;
          vel.x += clamp(tx - vel.x, -step, step);
          vel.y += clamp(ty - vel.y, -step, step);
        } else {
          // Mouse/touch: fly toward the pointer
          const tx = clamp((pointerTarget.x - player.position.x) * POINTER_GAIN, -POINTER_SPEED_X, POINTER_SPEED_X);
          const ty = clamp((pointerTarget.y - player.position.y) * POINTER_GAIN, -POINTER_SPEED_Y, POINTER_SPEED_Y);
          const pstep = POINTER_ACCEL * dt;
          vel.x += clamp(tx - vel.x, -pstep, pstep);
          vel.y += clamp(ty - vel.y, -pstep, pstep);
        }
        player.position.x += vel.x * dt;
        player.position.y += vel.y * dt;
        if (Math.abs(player.position.x) > BOUND_X) { player.position.x = Math.sign(player.position.x) * BOUND_X; vel.x = 0; }
        if (Math.abs(player.position.y) > BOUND_Y) { player.position.y = Math.sign(player.position.y) * BOUND_Y; vel.y = 0; }
        player.rotation.z = -vel.x * 0.04;            // bank into turns
        player.rotation.x = vel.y * 0.035;            // nose up while climbing
        riderMat.rotation = -player.rotation.z * 0.5;

        distance += speed * dt;
        sinceSpawn += speed * dt;
        if (sinceSpawn >= nextSpacing) { sinceSpawn = 0; spawnGroup(SPAWN_Z); }
      }
      if (playing || state === "ready") updateHud(speed);

      // Near-miss text fade
      if (nearTimer > 0) { nearTimer -= dt; hud.near.style.opacity = Math.max(0, nearTimer / 0.6).toFixed(2); }

      // Move obstacles, collide, detect near misses, clean up
      if (state !== "dead") {
        const px = player.position.x, py = player.position.y + HIT_OFFSET_Y, pz = player.position.z;
        for (const o of obstacles) {
          const pos = o.mesh.position;
          const prevZ = pos.z;
          pos.z += speed * dt;
          pos.x += o.vx * dt;
          pos.y += o.vy * dt;
          o.mesh.rotation.x += o.spin.x * dt;
          o.mesh.rotation.y += o.spin.y * dt;
          o.mesh.rotation.z += o.spin.z * dt;
          // Radar: glowing outline that shows through the dark and fog
          if (playing && pickups.radarOn()) {
            if (!o.ghost) { o.ghost = new THREE.Mesh(o.mesh.geometry, radarMat); o.mesh.add(o.ghost); }
            o.ghost.visible = true;
          } else if (o.ghost) o.ghost.visible = false;
          if (!playing || o.gone) continue;
          const dx = px - pos.x, dy = py - pos.y, dz = pz - pos.z;
          const r = HIT_R + o.hitR;
          if (dx * dx + dy * dy + dz * dz < r * r) {
            if (pickups.dashing() || pickups.reviving()) { smash(o); shake = Math.max(shake, 0.12); continue; }
            if (pickups.tryUseLife()) {
              // Extra life: clear what's around the rocket and keep going
              obstacles.forEach(q => { if (q.mesh.position.z > -45) smash(q); });
              shake = Math.max(shake, 0.35);
              continue;
            }
            die(); break;
          }
          if (!o.passed && prevZ < pz && pos.z >= pz) {
            o.passed = true;
            const near = r + NEAR_MISS_MARGIN;
            if (dx * dx + dy * dy < near * near) {
              nearMisses++;
              nearTimer = 0.6;
              hud.near.style.opacity = 1;
              shake = Math.max(shake, 0.08);
            }
          }
        }
        obstacles = obstacles.filter(o => {
          if (o.gone) return false;
          if (o.mesh.position.z > DESPAWN_Z) { scene.remove(o.mesh); return false; }
          return true;
        });
      }

      // Camera follows from behind and above; closer and lower on the home screen to show off the rider
      const home = state === "menu";
      const camX = player.position.x * (home ? 0.3 : 0.6), camY = player.position.y * (home ? 0.3 : 0.6) + (home ? 1.9 : 2.7);
      camera.position.x += (camX - camera.position.x) * Math.min(1, dt * 6);
      camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 6);
      // On the home screen the whole play area doesn't need to fit, so tall screens can come in close too
      const homeZ = camera.aspect >= 1 ? baseCamZ * 0.72 : 9;
      camera.position.z += ((home ? homeZ : baseCamZ) - camera.position.z) * Math.min(1, dt * 3);
      if (shake > 0) {
        shake -= dt;
        camera.position.x += rand(-0.3, 0.3) * Math.min(1, shake * 3);
        camera.position.y += rand(-0.3, 0.3) * Math.min(1, shake * 3);
      }
      lookAt.set(player.position.x * (home ? 0.45 : 0.8), player.position.y * (home ? 0.6 : 0.8) + (home ? 0.4 : 0), -10);
      camera.lookAt(lookAt);
      const speedRatio = playing ? (baseSpeed() - G.baseSpeed) / (G.maxSpeed - G.baseSpeed) : 0;
      const fov = 70 + speedRatio * 12 + (dashing ? 10 : 0) - (playing && pickups.slowed() ? 4 : 0);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    }

    // Adaptive quality: if the frame rate stays low, render fewer pixels (never goes back up)
    let perfTime = 0, perfFrames = 0;
    const fpsBox = /[?&]fps\b/.test(location.search) ? document.body.appendChild(document.createElement("div")) : null;
    if (fpsBox) fpsBox.style.cssText = "position:fixed;right:8px;bottom:8px;font:12px monospace;color:#9fe;z-index:50;pointer-events:none";
    function trackPerformance(raw) {
      if (raw > 0.25) return;                      // tab was hidden or the page paused
      perfTime += raw; perfFrames++;
      if (perfTime < 2) return;
      const fps = perfFrames / perfTime;
      if (fps < 45 && pixelRatio > 0.75) {
        pixelRatio = Math.max(0.75, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
      }
      if (fpsBox) fpsBox.textContent = fps.toFixed(0) + " fps, quality " + pixelRatio.toFixed(2);
      perfTime = perfFrames = 0;
    }

    // Prepare every material once now, so the first crash, laser or debris doesn't freeze the game
    function warmUp() {
      const temp = [new THREE.Mesh(rockGeos[0], rockMat), new THREE.Mesh(rockGeos[1], radarMat)].concat(Object.values(debris).map(d => new THREE.Mesh(d.geo, d.mat)));
      ramGlow.visible = true;
      temp.forEach((m, i) => { m.position.set(i * 3 - 3, 0, -40); scene.add(m); });
      beams.visible = true;
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      temp.forEach(m => scene.remove(m));
      beams.visible = false;
      ramGlow.visible = false;
    }

    function frame() {
      requestAnimationFrame(frame);
      const raw = clock.getDelta();
      trackPerformance(raw);
      update(Math.min(raw, 0.05));
      renderer.render(scene, camera);
    }
    camera.position.set(0, 2.7, baseCamZ);
    hud.root.style.display = "none";
    warmUp();
    frame();

    return {
      // opts: { riderCanvas, riderPoses: { side, back }, laserCharges, multiplier, modeLabel, showScore }
      configure(opts) {
        setup = Object.assign({}, setup, opts);
        if (opts.riderCanvas) setRiderCanvas(opts.riderCanvas, opts.riderPoses);
      },
      toReady, toMenu, start,
      get state() { return state; },
      // Test hooks, used by the automated browser tests only
      _debug: { obstacles: () => obstacles, player, fireLaser, laserCharges: () => laserCharges, pickups, runTime: () => runTime,
        speed: () => (state === "playing" ? baseSpeed() * pickups.speedFactor() : 0),
        setMeters(m) { distance = m * G.unitsPerMeter; }, spawnAt(x, y, z, huge) {
        const o = makeObstacle(); o.vx = o.vy = 0; o.huge = !!huge; o.mesh.position.set(x, y, z); scene.add(o.mesh); obstacles.push(o); return o;
      } },
    };
  }

  root.ChogGame = { init };
})(window);
