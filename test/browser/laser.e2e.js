/*
 * Browser test of the Laser Eyes rules (practice mode with the dev laser flag).
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '../../');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const three = fs.readFileSync(path.join(R, 'node_modules/three/build/three.min.js'));
  await p.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await p.goto('file://' + path.join(R, 'index.html') + '?dev=laser');
  await p.waitForTimeout(1000);
  await p.click('#playBtn'); await p.waitForTimeout(300);
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  const r = await p.evaluate(() => {
    const g = ChogUI._game(), d = g._debug;
    d.obstacles().forEach(o => { o.mesh.position.z = -500; });     // move spawned field out of the way
    const px = d.player.position.x, py = d.player.position.y + 0.92;
    const a = d.spawnAt(px, py, -40, false); a.hitR = 1;
    const huge = d.spawnAt(px, py, -80, true); huge.hitR = 2.5;
    const behind = d.spawnAt(px, py, -100, false); behind.hitR = 1;
    const off = d.spawnAt(px + 6, py, -30, false); off.hitR = 1;
    const far = d.spawnAt(px, py, -200, false); far.hitR = 1;
    d.fireLaser();
    const has = o => d.obstacles().includes(o);
    const res = { inPathDestroyed: !has(a), hugeKept: has(huge), behindHugeKept: has(behind), offPathKept: has(off), outOfRangeKept: has(far), charges: d.laserCharges(), hud: document.getElementById('laserCount').textContent };
    for (let i = 0; i < 15; i++) d.fireLaser();
    res.chargesAfterSpam = d.laserCharges();
    return res;
  });
  assert.deepStrictEqual(r, { inPathDestroyed: true, hugeKept: true, behindHugeKept: true, offPathKept: true, outOfRangeKept: true, charges: 9, hud: '9/10', chargesAfterSpam: 0 });
  assert.ok(!(await p.$('#laserBtn')), 'no on-screen LASER button');

  // The E key fires: the beam shows, the rock in the path is destroyed, the counter drops
  const shot = n => process.env.SHOTS && p.screenshot({ path: path.join(process.env.SHOTS, 'laser-' + n + '.png') });
  await p.goto('file://' + path.join(R, 'index.html') + '?dev=laser');
  await p.waitForTimeout(1000);
  await p.click('#playBtn'); await p.waitForTimeout(300);
  await p.keyboard.press('Space'); await p.waitForTimeout(100);
  assert.match(await p.textContent('#laserBox'), /^E\s*2-FINGER TAP\s*LASER\s*10\/10$|E.*LASER.*10\/10/);
  assert.ok(await p.isVisible('#laserBox .lz-key'), 'E key shown on the HUD (desktop)');
  await p.evaluate(() => {
    const d = ChogUI._game()._debug;
    d.obstacles().forEach(o => { o.mesh.position.z = -500; });
    window.__rock = d.spawnAt(d.player.position.x, d.player.position.y + 0.92, -25, false); window.__rock.hitR = 1;
  });
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(60);
  const k = await p.evaluate(() => { const d = ChogUI._game()._debug; return { beam: d.beamOn(), destroyed: !d.obstacles().includes(window.__rock), hud: document.getElementById('laserCount').textContent, flash: document.getElementById('laserBox').classList.contains('fire') }; });
  await shot('key');
  assert.deepStrictEqual(k, { beam: true, destroyed: true, hud: '9/10', flash: true }, 'E fires the laser');
  await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => ChogUI._game()._debug.beamOn()), false, 'beam fades');

  // Phone: one finger flies, a second finger's tap fires
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const m = await ctx.newPage();
  m.on('pageerror', e => errs.push(e.message));
  await m.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await m.goto('file://' + path.join(R, 'index.html') + '?dev=laser');
  await m.waitForTimeout(1000);
  await m.tap('#playBtn'); await m.waitForTimeout(300);
  await m.touchscreen.tap(420, 200); await m.waitForTimeout(200);
  assert.strictEqual(await m.evaluate(() => ChogUI._game().state), 'playing');
  assert.ok(await m.isVisible('#laserBox .lz-touch'), '"2-FINGER TAP" shown on touch screens');
  const cdp = await ctx.newCDPSession(m);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }]);
  await touch('touchMove', [{ x: 320, y: 240, id: 1 }]);
  assert.strictEqual(await m.textContent('#laserCount'), '10/10', 'one finger only steers');
  await touch('touchStart', [{ x: 320, y: 240, id: 1 }, { x: 600, y: 150, id: 2 }]);
  await touch('touchEnd', [{ x: 320, y: 240, id: 1 }]);
  await touch('touchEnd', []);
  await m.waitForTimeout(100);
  assert.strictEqual(await m.textContent('#laserCount'), '9/10', 'second finger fires');
  if (process.env.SHOTS) await m.screenshot({ path: path.join(process.env.SHOTS, 'laser-touch.png') });
  assert.deepStrictEqual(errs, []);
  console.log('PASS laser rules, E key and two-finger tap');
  await b.close();
})();
