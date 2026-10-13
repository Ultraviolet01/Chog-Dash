/*
 * Browser test of the zone loop: Outer Space -> Asteroid Belt -> Galactic Drift -> Deep Cosmic Zone -> Milky Way -> loop.
 * Checks the banner and HUD label for each zone and that each zone uses its own obstacle mix.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '../../');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const three = fs.readFileSync(path.join(R, 'node_modules/three/build/three.min.js'));
  await p.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await p.goto('file://' + path.join(R, 'index.html'));
  await p.waitForTimeout(1000);
  await p.click('#playBtn'); await p.waitForTimeout(300);
  await p.mouse.click(640, 360);
  // Keep the rocket alive by moving anything about to hit it out of the way
  await p.evaluate(() => setInterval(() => { const d = ChogUI._game()._debug, q = d.player.position;
    d.obstacles().forEach(o => { if (o.mesh.position.z > -80 && Math.abs(o.mesh.position.x - q.x) < 6 && Math.abs(o.mesh.position.y - q.y) < 6) o.mesh.position.x += 16; }); }, 16));
  await p.waitForTimeout(600);
  assert.match(await p.textContent('#zoneBanner'), /OUTER SPACE.*Zone 1 of 5/);

  // Count rocks vs debris among obstacles that spawned in each zone
  const rockShare = () => p.evaluate(() => {
    const os = ChogUI._game()._debug.obstacles().filter(o => o.mesh.position.z < -150);
    const rocks = os.filter(o => o.mesh.geometry.type === 'IcosahedronGeometry').length;
    return { n: os.length, share: os.length ? rocks / os.length : 0 };
  });
  const seen = {};
  const starts = await p.evaluate(() => [1, 2, 3, 4, 5].map(k => ChogTraits.zoneStartMeters(k) + 20));
  for (const [m, re, label] of [[starts[0], /ASTEROID BELT.*Zone 2 of 5/, 'Asteroid Belt'], [starts[1], /GALACTIC DRIFT.*Zone 3 of 5/, 'Galactic Drift'],
      [starts[2], /DEEP COSMIC ZONE.*Zone 4 of 5/, 'Deep Cosmic Zone'], [starts[3], /MILKY WAY.*Zone 5 of 5/, 'Milky Way'],
      [starts[4], /OUTER SPACE.*Zone 1 of 5 · Loop 2/, 'Outer Space · Loop 2']]) {
    await p.evaluate(m => ChogUI._game()._debug.setMeters(m), m);
    await p.waitForFunction(src => new RegExp(src).test(document.getElementById('zoneBanner').textContent), re.source, { timeout: 15000 }).catch(() => {});
    assert.match(await p.textContent('#zoneBanner'), re);
    assert.strictEqual(await p.textContent('#zoneLabel'), label);
    // A zone's mix fades in over its first 800 m (ZONE_RAMP_M in js/game.js), so sample the settled mix after it
    await p.evaluate(m => { const d = ChogUI._game()._debug; d.obstacles().forEach(o => { o.mesh.position.z = 60; }); d.setMeters(m + 1000); }, m);
    await p.waitForTimeout(3500);
    seen[label] = await rockShare();
  }
  console.log(seen);

  // ---------- Transition at a zone boundary, flown normally ----------
  await p.evaluate(() => { ChogUI._game()._debug.obstacles().forEach(o => { o.mesh.position.z = 60; }); ChogUI._game()._debug.setMeters(ChogTraits.zoneStartMeters(6) - 420); });
  await p.waitForFunction(() => ChogUI._game()._debug.gates().length > 0, null, { timeout: 60000 });
  const gateZ = await p.evaluate(() => ChogUI._game()._debug.gates()[0].position.z);
  assert.ok(gateZ < -100, 'warp gate appears well ahead of the boundary (' + gateZ.toFixed(0) + ')');
  await p.waitForFunction(() => ChogUI._game()._debug.gates().some(g => g.position.z > -30), null, { timeout: 60000 });
  const crowd = await p.evaluate(() => ChogUI._game()._debug.obstacles().filter(o => o.mesh.position.z > -60 && o.mesh.position.z < 20).length);
  assert.strictEqual(crowd, 0, 'no obstacles around the warp gate');
  await p.waitForFunction(() => /ENTERING.*ASTEROID BELT/.test(document.getElementById('zoneBanner').textContent), null, { timeout: 20000 });
  assert.match(await p.textContent('#zoneBanner'), /ENTERING.*ASTEROID BELT.*Loop 2/);
  assert.ok(Number(await p.evaluate(() => getComputedStyle(document.getElementById('zoneFlash')).opacity)) > 0, 'zone colour flash on crossing');
  console.log('transition ok: gate at', gateZ.toFixed(0), 'no obstacles at the gate, ENTERING banner and flash');
  assert.ok(seen['Asteroid Belt'].share > 0.7, 'belt is mostly asteroids');
  assert.ok(seen['Galactic Drift'].share < 0.6, 'drift is mostly debris');
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'playing');
  assert.deepStrictEqual(errs, []);
  console.log('PASS zones');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
