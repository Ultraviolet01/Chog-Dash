/*
 * Browser test of full screen: home button, F key, in-game button, and cursor hiding while flying.
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
  await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(path.join(R, 'node_modules/three/build/three.min.js')), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.join(R, 'index.html'));
  await p.waitForTimeout(1000);
  const full = () => p.evaluate(() => !!document.fullscreenElement);
  const label = () => p.textContent('#fsBtn .fs-label');

  assert.ok(await p.isVisible('#fsBtn'), 'full screen button on the home screen');
  await p.click('#fsBtn'); await p.waitForTimeout(400);
  assert.ok(await full(), 'home button enters full screen');
  assert.strictEqual(await label(), 'Exit full screen');
  await p.click('#fsBtn'); await p.waitForTimeout(400);
  assert.ok(!(await full()), 'home button leaves full screen');

  await p.keyboard.press('KeyF'); await p.waitForTimeout(400);
  assert.ok(await full(), 'F enters full screen');
  await p.keyboard.press('KeyF'); await p.waitForTimeout(400);
  assert.ok(!(await full()), 'F leaves full screen');

  await p.click('#playBtn'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#hudFsBtn'), 'in-game full screen button on the ready screen');
  await p.click('#hudFsBtn'); await p.waitForTimeout(400);
  assert.ok(await full(), 'in-game button enters full screen');
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'playing');
  assert.ok(!(await p.isVisible('#hudFsBtn')), 'in-game button hidden while flying');
  assert.strictEqual(await p.evaluate(() => getComputedStyle(document.getElementById('gameCanvas')).cursor), 'none', 'cursor hidden while flying');
  await p.keyboard.press('KeyF'); await p.waitForTimeout(400);
  assert.ok(!(await full()), 'F works while flying');
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'playing', 'F does not interrupt the run');
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 });
  assert.notStrictEqual(await p.evaluate(() => getComputedStyle(document.getElementById('gameCanvas')).cursor), 'none', 'cursor back after a crash');
  assert.ok(await p.isVisible('#hudFsBtn'), 'in-game button back after a crash');
  // F typed into the pilot name box must not toggle full screen
  await p.click('#hudMenuBtn'); await p.click('#walletChip'); await p.waitForTimeout(300);
  await p.evaluate(() => { document.getElementById('pilotCard').style.display = 'block'; });
  await p.focus('#pilotInput'); await p.keyboard.press('KeyF'); await p.waitForTimeout(300);
  assert.ok(!(await full()), 'typing F in a text box does not toggle full screen');
  assert.deepStrictEqual(errs, []);
  console.log('PASS full screen');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
