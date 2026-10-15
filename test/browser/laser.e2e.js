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
  assert.match(await p.textContent('#laserBox'), /E.*LASER.*10\/10/);
  assert.ok(await p.isVisible('#laserBox .lz-key'), 'E key shown on the HUD (desktop)');
  await p.evaluate(() => {
    const d = ChogUI._game()._debug;
    d.obstacles().forEach(o => { o.mesh.position.z = -500; });
    window.__rock = d.spawnAt(d.player.position.x, d.player.position.y + 0.92, -25, false); window.__rock.hitR = 1;
  });
  await p.evaluate(() => { window.__snd = []; const play = ChogAudio.play; ChogAudio.play = n => { window.__snd.push(n); play(n); }; });
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(60);
  const k = await p.evaluate(() => { const d = ChogUI._game()._debug; return { beam: d.beamOn(), destroyed: !d.obstacles().includes(window.__rock), hud: document.getElementById('laserCount').textContent, flash: document.getElementById('laserBox').classList.contains('fire') }; });
  await shot('key');
  assert.deepStrictEqual(k, { beam: true, destroyed: true, hud: '9/10', flash: true }, 'E fires the laser');
  await p.waitForTimeout(400);
  assert.strictEqual(await p.evaluate(() => ChogUI._game()._debug.beamOn()), false, 'beam fades');
  assert.deepStrictEqual(await p.evaluate(() => window.__snd.filter(n => /^laser/.test(n))), ['laser', 'laserHit'], 'zap, then a blast for the rock it destroyed');
  // A huge asteroid blocks the beam: a clang instead
  await p.evaluate(() => {
    const d = ChogUI._game()._debug; window.__snd = [];
    d.obstacles().forEach(o => { o.mesh.position.z = -500; });
    const big = d.spawnAt(d.player.position.x, d.player.position.y + 0.92, -60, true); big.hitR = 2.5;
  });
  await p.keyboard.press('KeyE'); await p.waitForTimeout(200);
  assert.deepStrictEqual(await p.evaluate(() => window.__snd.filter(n => /^laser/.test(n))), ['laser', 'laserBlock'], 'zap, then a clang off the huge asteroid');

  // Phone: one finger flies; the round LASER button (bottom right) fires; a second finger on the screen does not
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const m = await ctx.newPage();
  m.on('pageerror', e => errs.push(e.message));
  await m.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await m.goto('file://' + path.join(R, 'index.html') + '?dev=laser');
  await m.waitForTimeout(1000);
  await m.tap('#playBtn'); await m.waitForTimeout(300);
  await m.touchscreen.tap(420, 200); await m.waitForTimeout(200);
  assert.strictEqual(await m.evaluate(() => ChogUI._game().state), 'playing');
  // Keep the rocket alive while the touch steps run (moves nearby obstacles aside)
  await m.evaluate(() => { setInterval(() => { const d = ChogUI._game()._debug, q = d.player.position;
    d.obstacles().forEach(o => { if (o.mesh.position.z > -12 && Math.abs(o.mesh.position.x - q.x) < 5 && Math.abs(o.mesh.position.y - q.y) < 5) o.mesh.position.x += 14; }); }, 16); });
  const btn = await m.evaluate(() => { const r = document.getElementById('laserBox').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, right: innerWidth - r.right }; });
  assert.ok(btn.w >= 70 && btn.right < 40, 'round LASER button at the bottom right: ' + JSON.stringify(btn));
  const cdp = await ctx.newCDPSession(m);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: 300, y: 250, id: 1 }]);
  await touch('touchMove', [{ x: 320, y: 240, id: 1 }]);
  assert.strictEqual(await m.textContent('#laserCount'), '10/10', 'one finger only steers');
  await touch('touchStart', [{ x: 320, y: 240, id: 1 }, { x: 500, y: 150, id: 2 }]);
  await touch('touchEnd', [{ x: 320, y: 240, id: 1 }]);
  await m.waitForTimeout(100);
  assert.strictEqual(await m.textContent('#laserCount'), '10/10', 'a second finger on the screen does not fire (no pinch gesture)');
  // Steering finger down, other thumb taps the button
  await touch('touchStart', [{ x: 320, y: 240, id: 1 }, { x: btn.x, y: btn.y, id: 3 }]);
  await touch('touchEnd', [{ x: 320, y: 240, id: 1 }]);
  await touch('touchMove', [{ x: 360, y: 240, id: 1 }]);
  await m.waitForTimeout(100);
  assert.strictEqual(await m.textContent('#laserCount'), '9/10', 'LASER button fires while the other thumb steers');
  await touch('touchEnd', []);
  await m.touchscreen.tap(btn.x, btn.y); await m.waitForTimeout(100);
  assert.strictEqual(await m.textContent('#laserCount'), '8/10', 'LASER button fires on its own');
  // Browsers that only send touch events (some in-app wallet browsers) fire it too; one tap is one shot
  await m.waitForTimeout(150);
  await m.evaluate(() => { const el = document.getElementById('laserBox'); const t = new Touch({ identifier: 9, target: el, clientX: 1, clientY: 1 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true })); });
  assert.strictEqual(await m.textContent('#laserCount'), '7/10', 'a touch-event-only tap fires once');
  assert.ok(await m.evaluate(() => document.body.classList.contains('touch')), 'touch screens are marked, so the round button shows even if the media query does not match');
  assert.strictEqual(await m.evaluate(() => ChogUI._game().state), 'playing');
  if (process.env.SHOTS) await m.screenshot({ path: path.join(process.env.SHOTS, 'laser-touch.png') });
  assert.deepStrictEqual(errs, []);
  console.log('PASS laser rules, E key and LASER button');
  await b.close();
})();
