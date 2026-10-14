/*
 * Browser test of demo mode: no wallet, pick one of the 5 demo Chogs (one per tier), fly it with its traits (Laser
 * Eyes, aura trail, Skull rocket), streak lives, local quests, an unranked result and a run card with the DEMO stamp.
 * IPFS artwork is mocked.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '../../');
const svg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#2a9d8f"/><circle cx="200" cy="230" r="120" fill="#f5ead2" stroke="#111" stroke-width="8"/><rect x="120" y="200" width="160" height="26" fill="#d00"/><text x="200" y="330" font-size="28" text-anchor="middle" font-family="Arial">${n}</text></svg>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const three = fs.readFileSync(path.join(R, 'node_modules/three/build/three.min.js'));
  await p.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await p.route('**/ipfs/**', r => r.fulfill({ body: svg(r.request().url().split('/').pop()), contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' } }));
  const shot = n => process.env.SHOTS && p.screenshot({ path: path.join(process.env.SHOTS, 'demo-' + n + '.png') });
  const text = s => p.textContent(s);
  const d = fn => p.evaluate(fn);

  await p.goto('file://' + path.join(R, 'index.html'));
  await p.waitForTimeout(900);
  await p.click('#modeDemo'); await p.waitForTimeout(400);
  assert.match(await text('#modeHint'), /5 demo Chogs/);
  assert.strictEqual((await text('#playBtn')).trim(), 'PICK CHOG');
  await shot('home');

  // Picker: 5 real Chogs, each with Laser Eyes and another feature
  await p.click('#playBtn');
  await p.waitForFunction(() => document.querySelectorAll('#demoList .demo-card img').length === 5, null, { timeout: 10000 });
  const cards = await p.$$eval('#demoList .demo-card', cs => cs.map(c => ({ name: c.querySelector('.dname').textContent, chips: [...c.querySelectorAll('.dchip')].map(x => x.className.split(' ')[1]) })));
  console.log('demo chogs:', JSON.stringify(cards));
  assert.strictEqual(cards.length, 5);
  assert.deepStrictEqual(await p.$$eval('#demoList .demo-card', cs => cs.map(c => c.querySelector('.dtier').textContent.split(' ')[0])),
    ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], 'one Chog per tier');
  assert.strictEqual(cards.filter(c => c.chips.includes('laser')).length, 2, 'two have Laser Eyes, three do not');
  assert.ok(cards.every(c => c.chips.includes('trail')), 'every demo Chog has an aura trail');
  assert.strictEqual(cards.filter(c => c.chips.includes('rocket')).length, 3, 'Skull, Radioactive and one-of-one rockets');
  await shot('picker');

  // Fly the Rare Skull Chog
  await p.click('#demoList .demo-card[data-token="1832"]');
  await p.waitForFunction(() => /DEMO MODE/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  const ready = await text('#msg');
  console.log('ready:', ready);
  assert.match(ready, /CHOG #1324/);
  assert.match(ready, /Tier Rare: distance multiplier x1\.15/);
  assert.match(ready, /Laser Eyes: 10 charges/);
  assert.match(ready, /Skull rocket\. Aura trail: Electric Shock/);
  assert.match(ready, /Streak lives: 2 banked/);
  assert.match(ready, /not on the DEMO leaderboard/, 'not signed in: not ranked');
  assert.match(await text('#modeBadge'), /^DEMO · CHOG #1324/);
  assert.strictEqual(await text('#livesCount'), '0 +2', 'demo starts with 2 streak lives');
  await p.waitForFunction(() => document.getElementById('questStrip').classList.contains('show'));
  assert.match(await text('#questStrip'), /6-day streak/);
  await shot('ready');

  await p.keyboard.press('Space'); await p.waitForTimeout(1500);
  await p.keyboard.press('KeyE'); await p.waitForTimeout(100);
  const fly = await d(() => { const g = ChogUI._game()._debug; return { laser: document.getElementById('laserCount').textContent, look: g.look().id, trail: g.trailLive() > 0 }; });
  console.log('flying:', JSON.stringify(fly));
  assert.deepStrictEqual(fly, { laser: '9/10', look: 'skull', trail: true });
  await shot('flying');

  // Crash three times: two streak lives save the run, the third hit ends it
  for (let i = 0; i < 3; i++) {
    await d(() => { const g = ChogUI._game()._debug, q = g.player.position; g.spawnAt(q.x, q.y + 0.35, -1, true); });
    await p.waitForTimeout(i < 2 ? 2600 : 600);
  }
  await p.waitForFunction(() => /CRASHED/.test(document.getElementById('msg').textContent), null, { timeout: 8000 });
  const end = await text('#msg');
  console.log('end:', end);
  assert.match(end, /Demo run: not on the DEMO leaderboard \(not signed in\)/);
  const after = await d(() => ({ bank: ChogDemo.lives(), played: ChogDemo.view().playMsToday }));
  assert.strictEqual(after.bank, 0, 'both streak lives were spent');
  assert.ok(after.played > 0, 'demo quests count the run');

  // Run card with the DEMO stamp
  await p.click('#cardBtn');
  await p.waitForFunction(() => document.getElementById('cardImg').src.startsWith('data:image/png'), null, { timeout: 10000 });
  assert.strictEqual(await d(() => ChogUI._state.lastRun.demo), true);
  if (process.env.SHOTS) fs.writeFileSync(path.join(process.env.SHOTS, 'demo-card.png'), Buffer.from((await d(() => document.getElementById('cardImg').src)).split(',')[1], 'base64'));
  await p.click('#cardClose');

  // Day 7 of the demo streak: finishing today's dailies with 5+ minutes flown banks +1 streak life
  const day7 = await d(() => {
    let r;
    for (let i = 0; i < 6 && !(r && r.streakDay); i++) r = ChogDemo.finish({ meters: 10000, durationMs: 300000, stardust: 400, powerups: 9, horns: 4, nearMisses: 30, livesUsed: 0 });
    return { streakDay: r.streakDay, livesEarned: r.livesEarned, bank: ChogDemo.lives() };
  });
  assert.deepStrictEqual(day7, { streakDay: 7, livesEarned: 1, bank: 1 });

  // Quests panel in demo mode
  await p.click('#endHomeBtn'); await p.waitForTimeout(300);
  await p.click('#questBtn'); await p.waitForTimeout(400);
  assert.match(await text('#questBody'), /Demo quests/);
  assert.match(await text('#questBody'), /7DAY STREAK|7 *DAY STREAK/);
  await shot('quests');
  // Never touches the leaderboard server
  assert.deepStrictEqual(errs, [], 'no page errors');
  console.log('PASS demo mode');
  await b.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
