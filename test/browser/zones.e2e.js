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
    d.obstacles().forEach(o => { if (o.mesh.position.z > -12 && Math.abs(o.mesh.position.x - q.x) < 5 && Math.abs(o.mesh.position.y - q.y) < 5) o.mesh.position.x += 14; }); }, 16));
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
    await p.waitForTimeout(400);
    assert.match(await p.textContent('#zoneBanner'), re);
    assert.strictEqual(await p.textContent('#zoneLabel'), label);
    await p.waitForTimeout(3500);
    seen[label] = await rockShare();
  }
  console.log(seen);
  assert.ok(seen['Asteroid Belt'].share > 0.7, 'belt is mostly asteroids');
  assert.ok(seen['Galactic Drift'].share < 0.6, 'drift is mostly debris');
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'playing');
  assert.deepStrictEqual(errs, []);
  console.log('PASS zones');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
