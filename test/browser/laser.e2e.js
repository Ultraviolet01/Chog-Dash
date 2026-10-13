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
  await p.click('#practiceBtn'); await p.waitForTimeout(300);
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
  assert.deepStrictEqual(errs, []);
  console.log('PASS laser rules');
  await b.close();
})();
