/*
 * Browser test of controls: the rocket follows the mouse up/down and left/right, holding the mouse
 * button does not make it rise, and keyboard movement holds position when keys are released.
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

  // Keyboard: the rocket moves while a key is held and stays put after release (no falling back down)
  await p.keyboard.down('KeyW'); await p.waitForTimeout(500); await p.keyboard.up('KeyW');
  const afterW = await pos();
  await p.waitForTimeout(1500);
  const restW = await pos();
  await p.keyboard.down('ArrowDown'); await p.waitForTimeout(300); await p.keyboard.up('ArrowDown');
  const afterDown = await pos();
  await p.waitForTimeout(1500);
  const restDown = await pos();
  await p.keyboard.down('KeyD'); await p.waitForTimeout(400); await p.keyboard.up('KeyD');
  await p.waitForTimeout(1000);
  const restD = await pos();
  console.log({ afterW, restW, afterDown, restDown, restD });
  assert.ok(afterW.y > held.y + 2, 'W moves the rocket up');
  assert.ok(Math.abs(restW.y - afterW.y) < 0.6, 'rocket stays up after W is released');
  assert.ok(afterDown.y < restW.y - 1, 'Down moves the rocket down');
  assert.ok(Math.abs(restDown.y - afterDown.y) < 0.6, 'rocket stays put after Down is released');
  assert.ok(restD.x > restDown.x + 1, 'D moves the rocket right and it stays');

  assert.ok(top.y > 3, 'mouse at top moves the rocket up');
  assert.ok(bottom.y < -3, 'mouse at bottom moves the rocket down');
  assert.ok(left.x < -5 && right.x > 5, 'mouse left/right steers');
  assert.ok(held.y < -3, 'holding the mouse button does not make it rise');
  assert.strictEqual(await p.evaluate(() => ChogUI._game().state), 'playing');
  assert.deepStrictEqual(errs, []);
  console.log('PASS mouse control');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
