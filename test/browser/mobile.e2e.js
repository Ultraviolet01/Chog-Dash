/*
 * Phone check (emulated iPhone 13 portrait and landscape, touch input): nothing overflows the screen,
 * home screen tap targets are at least 44 px, the home rocket sits between PLAY and the bottom buttons,
 * touch drag steers the rocket, and after a crash the run card opens and a tap restarts.
 *   node test/browser/mobile.e2e.js
 */
const { chromium, devices } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '../../') + '/';
const launchOpts = { executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

(async () => {
  const b = await chromium.launch(launchOpts);
  for (const name of ['iPhone 13', 'iPhone 13 landscape']) {
    const ctx = await b.newContext(devices[name]);
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(R + 'node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
    await p.goto('file://' + R + 'index.html');
    await p.waitForFunction(() => window.ChogUI && ChogUI._game());
    await p.waitForTimeout(1500);
    const vw = p.viewportSize();

    const overflow = await p.evaluate(() => [...document.querySelectorAll('#menuPanel *')].filter(e => {
      const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    }).map(e => e.id || e.className));
    assert.deepStrictEqual(overflow, [], name + ': home fits the screen');
    const small = await p.evaluate(() => [...document.querySelectorAll('#menuPanel button')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 44).map(e => e.id));
    assert.deepStrictEqual(small, [], name + ': tap targets at least 44 px tall');
    if (vw.height > vw.width) {
      // The rocket is drawn between the PLAY button and the bottom buttons
      const gap = await p.evaluate(() => [document.getElementById('playBtn').getBoundingClientRect().bottom, document.querySelector('.home-bottom').getBoundingClientRect().top]);
      const heroY = await p.evaluate(() => { const g = ChogUI._game(); const v = g._debug.player.position.clone(); v.y += 0.6; return v; });
      const screenY = await p.evaluate(v => { const c = ChogUI._game()._debug.camera; const w = new THREE.Vector3(v.x, v.y, v.z).project(c); return (1 - w.y) / 2 * innerHeight; }, heroY);
      assert.ok(screenY > gap[0] && screenY < gap[1], name + ': home rocket in the free space (' + Math.round(screenY) + ' between ' + gap.map(Math.round) + ')');
    }

    await p.tap('#playBtn'); await p.waitForTimeout(500);
    await p.touchscreen.tap(vw.width / 2, vw.height / 2);
    await p.waitForFunction(() => ChogUI._game().state === 'playing', null, { timeout: 5000 });
    await p.evaluate(() => { window.__keep = setInterval(() => ChogUI._game()._debug.obstacles().forEach(o => { o.mesh.position.z = 60; }), 30); });
    const cdp = await ctx.newCDPSession(p);
    const x0 = await p.evaluate(() => ChogUI._game()._debug.player.position.x);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vw.width / 2, y: vw.height * 0.6 }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vw.width / 2 - i * 10, y: vw.height * 0.6 }] }); await p.waitForTimeout(25); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(700);
    const x1 = await p.evaluate(() => ChogUI._game()._debug.player.position.x);
    assert.ok(x1 < x0 - 1, name + ': dragging left steers left (' + x0.toFixed(2) + ' -> ' + x1.toFixed(2) + ')');

    await p.evaluate(() => { clearInterval(window.__keep); const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
    await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 8000 });
    await p.waitForTimeout(800);
    assert.ok(await p.isVisible('#cardBtn'), name + ': share button after crash');
    await p.tap('#cardBtn');
    await p.waitForFunction(() => document.getElementById('cardImg').naturalWidth === 1200 && ChogUI._state.lastRun.practice, null, { timeout: 5000 });
    await p.tap('#cardClose');
    await p.waitForTimeout(300);
    await p.touchscreen.tap(vw.width / 2, vw.height / 3);
    await p.waitForFunction(() => ChogUI._game().state === 'ready', null, { timeout: 3000 });
    assert.deepStrictEqual(errs, [], name + ': no page errors');
    console.log('ok', name);
    await ctx.close();
  }
  await b.close();
  console.log('PASS mobile');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
