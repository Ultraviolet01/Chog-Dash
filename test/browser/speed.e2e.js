/*
 * High speed: the world can move further than the rocket's size in one frame. Collisions and pickups
 * use the closest approach along each frame's move, so nothing can slip through between frames.
 *   node test/browser/speed.e2e.js
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '../../') + '/';
const launchOpts = { executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

(async () => {
  const b = await chromium.launch(launchOpts);
  const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(R + 'node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.goto('file://' + R + 'index.html');
  await p.waitForFunction(() => window.ChogUI && ChogUI._game());
  await p.click('#playBtn'); await p.waitForTimeout(300);
  await p.keyboard.press('Space');
  await p.waitForFunction(() => ChogUI._game().state === 'playing');
  // Far into the run (Milky Way, loop 2): very fast, so a frame moves the world several rocket-widths
  await p.evaluate(() => { const d = ChogUI._game()._debug; d.pickups._debug.setNext(1e9, 1e9, 1e9); d.obstacles().forEach(o => { o.mesh.position.z = 60; }); d.setMeters(ChogTraits.zoneStartMeters(9) + 5000); });
  await p.waitForTimeout(400);
  const speed = await p.evaluate(() => ChogUI._game()._debug.speed());
  // Stardust straight ahead, a little in front: it must be collected, not skipped
  const before = await p.evaluate(() => ChogUI._game()._debug.pickups.stats().stardust);
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; for (let i = 0; i < 5; i++) d.pickups._debug.spawn('stardust', null, q.x, q.y + 0.35, -6 - i * 9); });
  await p.waitForTimeout(800);
  const got = await p.evaluate(() => ChogUI._game()._debug.pickups.stats().stardust) - before;
  assert.strictEqual(got, 5, 'all 5 Stardust in the path collected at speed ' + Math.round(speed) + ' (got ' + got + ')');
  // A rock straight ahead must hit
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.obstacles().forEach(o => { o.mesh.position.z = 60; }); d.spawnAt(q.x, q.y + 0.35, -6, false); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 3000 }).catch(() => {});
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'dead', 'a rock in the path hits at speed ' + Math.round(speed));
  assert.deepStrictEqual(errs, []);
  console.log('PASS high speed (world speed ' + Math.round(speed) + ' units/s)');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
