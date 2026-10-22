/*
 * Phone check (emulated iPhone 13 portrait and landscape, touch input): nothing overflows the screen,
 * home screen tap targets are at least 44 px, the home rocket sits between PLAY and the bottom buttons,
 * touch drag steers the rocket, and after a crash the run card opens and a tap restarts.
 *   node test/browser/mobile.e2e.js
 */
const { chromium, devices } = require('playwright-core');
const { skipHighScore } = require('./high-score.js');
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
    await skipHighScore(p);   // the first crash sets a new best: tap through its screen
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
    // The same swipe moves the rocket the same amount sideways as up/down (smooth, even steering), with no overshoot
    const swipe = async (dx, dy) => {
      const q0 = await p.evaluate(() => { const q = ChogUI._game()._debug.player.position; return [q.x, q.y]; });
      const sx = vw.width / 2, sy = vw.height * 0.6;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + dx * i / 10, y: sy + dy * i / 10 }] }); await p.waitForTimeout(20); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(900);
      const q1 = await p.evaluate(() => { const q = ChogUI._game()._debug.player.position; return [q.x, q.y]; });
      return [q1[0] - q0[0], q1[1] - q0[1]];
    };
    const side = await swipe(60, 0), up = await swipe(0, -60);
    const ratio = side[0] / up[1];
    assert.ok(side[0] > 0.5 && up[1] > 0.5 && ratio > 0.85 && ratio < 1.18, name + ': a swipe moves the rocket as far sideways as up (' + side[0].toFixed(2) + ' vs ' + up[1].toFixed(2) + ')');

    await p.evaluate(() => { clearInterval(window.__keep); const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
    await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 8000 });
    await p.waitForFunction(() => document.getElementById('gameOver').classList.contains('show'), null, { timeout: 10000 });
    await p.waitForTimeout(300);
    assert.ok(await p.isVisible('#cardBtn'), name + ': share button after crash');
    await p.tap('#cardBtn');
    await p.waitForFunction(() => document.getElementById('cardImg').naturalWidth === 1200 && ChogUI._state.lastRun.practice, null, { timeout: 5000 });
    await p.tap('#cardClose');
    await p.waitForTimeout(300);
    assert.ok(await p.isVisible('#againBtn'), name + ': PLAY AGAIN shown');
    const againH = await p.evaluate(() => document.getElementById('againBtn').getBoundingClientRect().height);
    assert.ok(againH >= 44, name + ': PLAY AGAIN is a big tap target (' + againH + ' px)');
    if (vw.height > vw.width) {
      // A short screen (a wallet app's browser): the buttons stay on screen; the card's middle scrolls instead
      // Filled like a signed-in demo run: a rank, quest notes and today's quests (the tallest card)
      await p.evaluate(() => {
        const r = document.getElementById('goRank'); r.className = 'go-rank good'; r.innerHTML = '<span class="go-rk">#2</span><span>DEMO leaderboard: total distance 363 m, rank 2</span>';
        // (plus extra lines, so the card is taller than the screen whatever the device)
        document.getElementById('goNotes').innerHTML = ['Quest complete: Frequent flyer', 'Frequent flyer: Bronze badge', 'Quest complete: Mileage', 'Mileage: Bronze badge',
          'Quest complete: Untouchable', 'Untouchable: Bronze badge', 'Weekly: Horn hunter', 'Streak: day 1'].map(t => '<div class="go-note">' + t + '</div>').join('');
        const row = n => '<div class="go-q"><span class="go-qt">' + n + '</span><span class="go-qbar"><i style="width:40%"></i></span><span class="go-qp">1 / 3</span></div>';
        document.getElementById('goQuests').innerHTML = '<div class="go-qh">TODAY\'S QUESTS<b>1/3</b></div>' + row('Frequent flyer') + row('Mileage') + row('Untouchable');
        const st = document.getElementById('goStats'); st.dataset.n = 5; st.style.setProperty('--n', 5);
        st.innerHTML = ['TIME', 'STARDUST', 'NEAR MISSES', 'ZONE', 'LASER'].map((t, i) => '<div class="go-tile" style="--i:' + i + '"><span>' + t + '</span><b>0</b></div>').join('');
      });
      await p.setViewportSize({ width: 375, height: 640 }); await p.waitForTimeout(400);
      const fit = await p.evaluate(() => ['againBtn', 'endHomeBtn'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
      assert.deepStrictEqual(fit, [true, true], name + ': PLAY AGAIN and Home fully on screen at 375x640 with an overfull card');
      await p.setViewportSize(vw); await p.waitForTimeout(300);
    }
    await p.tap('#againBtn');
    await p.waitForFunction(() => ChogUI._game().state === 'playing', null, { timeout: 3000 });
    assert.deepStrictEqual(errs, [], name + ': no page errors');
    console.log('ok', name);
    await ctx.close();
  }
  await b.close();
  console.log('PASS mobile');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
