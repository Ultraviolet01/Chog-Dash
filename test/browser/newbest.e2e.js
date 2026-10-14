/*
 * Browser test: passing your best distance during a run shows "NEW BEST!" (with its sound) once per run.
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
  await p.addInitScript(() => { localStorage.setItem('chogDashPracticeBest', '300'); });
  await p.goto('file://' + path.join(R, 'index.html'));
  await p.waitForTimeout(1000);
  await p.evaluate(() => { window.__sounds = []; const a = ChogAudio.play; ChogAudio.play = n => { window.__sounds.push(n); a(n); }; });
  await p.click('#playBtn'); await p.waitForTimeout(300);
  await p.keyboard.press('Space'); await p.waitForTimeout(200);
  const d = fn => p.evaluate(fn);
  await d(() => ChogUI._game()._debug.obstacles().forEach(o => { o.mesh.position.z = -500; }));
  await d(() => ChogUI._game()._debug.setMeters(250)); await p.waitForTimeout(150);
  assert.strictEqual(await d(() => ChogUI._game()._debug.newBestShown()), false, 'not before passing the best');
  await d(() => ChogUI._game()._debug.setMeters(301)); await p.waitForTimeout(250);
  const r = await d(() => ({ shown: ChogUI._game()._debug.newBestShown(), banner: document.getElementById('newBest').classList.contains('show'),
    text: document.getElementById('newBest').textContent, sounds: window.__sounds.filter(n => n === 'newBest').length }));
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'newbest.png') });
  assert.deepStrictEqual(r, { shown: true, banner: true, text: 'NEW BEST!Past your 300 m', sounds: 1 });
  await d(() => ChogUI._game()._debug.setMeters(400)); await p.waitForTimeout(200);
  assert.strictEqual(await d(() => window.__sounds.filter(n => n === 'newBest').length), 1, 'once per run');
  assert.deepStrictEqual(errs, []);
  console.log('PASS new best banner');
  await b.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
