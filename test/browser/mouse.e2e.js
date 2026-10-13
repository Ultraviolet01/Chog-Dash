/*
 * Browser test of mouse control: the rocket follows the mouse up/down and left/right,
 * and holding the mouse button does not make it rise.
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
  await p.click('#practiceBtn'); await p.waitForTimeout(300);
  await p.mouse.click(640, 360);                       // click starts the run
  // Keep obstacles away so the run lasts through the test
  await p.evaluate(() => setInterval(() => ChogUI._game()._debug.obstacles().forEach(o => { o.mesh.position.z = -500; }), 16));
  const pos = () => p.evaluate(() => { const q = ChogUI._game()._debug.player.position; return { x: q.x, y: q.y }; });

  await p.mouse.move(640, 40); await p.waitForTimeout(1500);
  const top = await pos();
  await p.mouse.move(640, 680); await p.waitForTimeout(1500);
  const bottom = await pos();
  await p.mouse.move(60, 360); await p.waitForTimeout(1500);
  const left = await pos();
  await p.mouse.move(1220, 360); await p.waitForTimeout(1500);
  const right = await pos();
  // Holding the button at the bottom must not lift the rocket
  await p.mouse.move(640, 680); await p.mouse.down(); await p.waitForTimeout(1500);
  const held = await pos();
  await p.mouse.up();
  console.log({ top, bottom, left, right, held });

  assert.ok(top.y > 3, 'mouse at top moves the rocket up');
  assert.ok(bottom.y < -3, 'mouse at bottom moves the rocket down');
  assert.ok(left.x < -5 && right.x > 5, 'mouse left/right steers');
  assert.ok(held.y < -3, 'holding the mouse button does not make it rise');
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'playing');
  assert.deepStrictEqual(errs, []);
  console.log('PASS mouse control');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
