/*
 * Browser test of collectibles and power-ups: spawn timing, Dash, stacking, Slow-Mo, Magnet,
 * collecting by flying into a pickup, Nova, Radar (deep zone only), Mystery Box, no duplicate
 * types on screen, Stardust -> lives, crash with a life, and the lifetime Stardust total.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '../../');

const checks = [];
function ok(name, cond, detail) {
  checks.push(!!cond);
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? '  (' + detail + ')' : ''));
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(path.join(R, 'node_modules/three/build/three.min.js')), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.join(R, 'index.html'));
  await p.waitForTimeout(1000);
  await p.click('#playBtn'); await p.waitForTimeout(300);
  await p.keyboard.press('Space'); await p.waitForTimeout(200);
  const ev = fn => p.evaluate(fn);
  // Keep the rocket alive while waiting (moves obstacles aside; switched off for the crash tests)
  await ev(() => { window.__keep = setInterval(() => { const d = ChogUI._game()._debug, q = d.player.position;
    d.obstacles().forEach(o => { if (!o.keep && o.mesh.position.z > -12 && Math.abs(o.mesh.position.x - q.x) < 5 && Math.abs(o.mesh.position.y - q.y) < 5) o.mesh.position.x += 14; }); }, 16); });

  // ---------- Spawn timing ----------
  await p.waitForFunction(() => ChogUI._game()._debug.runTime() > 8, null, { timeout: 60000 });
  ok('nothing spawns before 10 s', await ev(() => ChogUI._game()._debug.pickups._debug.items().length) === 0);
  await p.waitForFunction(() => ChogUI._game()._debug.runTime() > 11, null, { timeout: 60000 });
  const kinds = await ev(() => ChogUI._game()._debug.pickups._debug.items().map(i => i.kind + (i.type ? ':' + i.type : '')));
  ok('pickups spawn after 10 s', kinds.length > 0, kinds.slice(0, 4).join(', '));

  // Clear the field so the rest of the checks are deterministic
  await ev(() => { const pk = ChogUI._game()._debug.pickups; pk._debug.items().forEach(i => { i.sprite.position.z = 999; }); pk._debug.setNext(1e9, 1e9, 1e9); });
  await p.waitForTimeout(200);

  // ---------- Dash ----------
  const base = await ev(() => ChogUI._game()._debug.speed());
  await ev(() => ChogUI._game()._debug.pickups.activate('dash', 'outer'));
  const dashSpeed = await ev(() => ChogUI._game()._debug.speed());
  ok('Dash speeds up the rocket (x1.8)', Math.abs(dashSpeed / base - 1.8) < 0.05, (dashSpeed / base).toFixed(2));
  ok('Dash popup shows', /DASH/.test(await p.textContent('#pickupPop')));
  ok('Dash icon with countdown in HUD', await ev(() => document.querySelectorAll('#powerBar .pw').length) === 1);
  const smashed = await ev(() => new Promise(res => { const d = ChogUI._game()._debug, q = d.player.position;
    const o = d.spawnAt(q.x, q.y + 0.35, -4, true); o.keep = true; setTimeout(() => res({ gone: !!o.gone, state: ChogUI._game().state }), 600); }));
  ok('Dash smashes through a huge asteroid', smashed.gone && smashed.state === 'playing', JSON.stringify(smashed));
  const before = await ev(() => ChogUI._game()._debug.pickups._debug.active.dash);
  await ev(() => ChogUI._game()._debug.pickups.activate('dash', 'outer'));
  const after = await ev(() => ChogUI._game()._debug.pickups._debug.active.dash);
  ok('grabbing Dash again adds 3 s', Math.abs(after - before - 3) < 0.1, before.toFixed(2) + ' -> ' + after.toFixed(2));
  ok('popup says time was added', /\+3s/.test(await p.textContent('#pickupPop')));
  await ev(() => { ChogUI._game()._debug.pickups._debug.active.dash = 0; });

  // ---------- Slow-Mo ----------
  const b2 = await ev(() => ChogUI._game()._debug.speed());
  await ev(() => ChogUI._game()._debug.pickups.activate('slow', 'outer'));
  const slow = await ev(() => ChogUI._game()._debug.speed());
  ok('Slow-Mo slows the game (x0.6)', Math.abs(slow / b2 - 0.6) < 0.05, (slow / b2).toFixed(2));
  ok('Slow-Mo tint on screen', await ev(() => document.body.classList.contains('slowmo')));
  await ev(() => { ChogUI._game()._debug.pickups._debug.active.slow = 0; });

  // ---------- Collect by flying into it, then Magnet ----------
  await ev(() => { const d = ChogUI._game()._debug, q = d.player.position; d.pickups._debug.spawn('power', 'magnet', q.x, q.y + 0.35, -12); });
  await p.waitForFunction(() => (ChogUI._game()._debug.pickups._debug.active.magnet || 0) > 0, null, { timeout: 5000 }).catch(() => {});
  ok('flying into a power-up collects it', await ev(() => (ChogUI._game()._debug.pickups._debug.active.magnet || 0) > 0));
  const dust0 = await ev(() => ChogUI._game()._debug.pickups.stats().stardust);
  await ev(() => { const d = ChogUI._game()._debug, q = d.player.position; for (let i = 0; i < 4; i++) d.pickups._debug.spawn('stardust', null, q.x + 6, q.y + 3, -20 - i * 3); });
  await p.waitForTimeout(1500);
  const dust1 = await ev(() => ChogUI._game()._debug.pickups.stats().stardust);
  ok('Magnet pulls in Stardust that is off to the side', dust1 - dust0 === 4, dust0 + ' -> ' + dust1);
  await ev(() => { ChogUI._game()._debug.pickups._debug.active.magnet = 0; });
  await ev(() => { const d = ChogUI._game()._debug, q = d.player.position; d.pickups._debug.spawn('stardust', null, q.x + 6, q.y + 3, -20); });
  await p.waitForTimeout(1500);
  ok('without Magnet, off-side Stardust is not collected', await ev(() => ChogUI._game()._debug.pickups.stats().stardust) === dust1);

  // ---------- Nova ----------
  const nova = await ev(() => { const d = ChogUI._game()._debug, q = d.player.position;
    const small = d.spawnAt(q.x + 3, q.y, -80, false), huge = d.spawnAt(q.x - 3, q.y, -90, true); small.keep = huge.keep = true;
    d.pickups.activate('nova', 'outer');
    return { small: !!small.gone, huge: !!huge.gone }; });
  ok('Nova clears small obstacles', nova.small === true);
  ok('Nova leaves huge asteroids', nova.huge === false);
  await ev(() => ChogUI._game()._debug.obstacles().forEach(o => { o.mesh.position.z = 50; }));

  // ---------- Radar ----------
  const allowed = await ev(() => ({ outer: ChogPickups.allowedTypes('outer'), deep: ChogPickups.allowedTypes('deep') }));
  ok('Radar never spawns outside the Deep Cosmic Zone', !allowed.outer.includes('radar'), allowed.outer.join(','));
  ok('Radar can spawn in the Deep Cosmic Zone', allowed.deep.includes('radar'));
  await ev(() => { const d = ChogUI._game()._debug, q = d.player.position; const o = d.spawnAt(q.x + 4, q.y, -120, false); o.keep = true; d.pickups.activate('radar', 'deep'); });
  await p.waitForTimeout(300);
  ok('Radar outlines obstacles', await ev(() => ChogUI._game()._debug.obstacles().some(o => o.ghost && o.ghost.visible)));
  await ev(() => { ChogUI._game()._debug.pickups._debug.active.radar = 0; });
  await p.waitForTimeout(200);
  ok('outlines go when Radar ends', await ev(() => !ChogUI._game()._debug.obstacles().some(o => o.ghost && o.ghost.visible)));

  // ---------- Mystery Box ----------
  await ev(() => ChogUI._game()._debug.pickups.activate('mystery', 'outer'));
  ok('Mystery Box turns into a power-up', /^MYSTERY: (DASH|MAGNET|SLOW-MO|NOVA)$/.test(await p.textContent('#pickupPop')), await p.textContent('#pickupPop'));
  ok('Mystery Box never gives Radar outside the deep zone', !/RADAR/.test(await p.textContent('#pickupPop')));
  await ev(() => { const a = ChogUI._game()._debug.pickups._debug.active; Object.keys(a).forEach(k => { a[k] = 0; }); });

  // ---------- No duplicate types on screen ----------
  const dup = await ev(() => { const pk = ChogUI._game()._debug.pickups._debug;
    const got = []; for (let i = 0; i < 8; i++) { const it = pk.spawnPower('outer'); got.push(it ? it.type : null); }
    pk.items().forEach(i => { i.sprite.position.z = 999; });
    return got; });
  const types = dup.filter(Boolean);
  ok('the same power-up is never on screen twice', new Set(types).size === types.length && types.length === 5, dup.join(','));

  // ---------- Stardust -> lives ----------
  await p.waitForTimeout(300);
  await ev(() => ChogUI._game()._debug.pickups._debug.addStardust(100 - (ChogUI._game()._debug.pickups.stats().meter)));
  ok('100 Stardust gives a life', await ev(() => ChogUI._game()._debug.pickups.stats().lives) === 1);
  ok('HUD shows the life', (await p.textContent('#livesCount')) === '1');
  await ev(() => ChogUI._game()._debug.pickups._debug.addStardust(1000));
  const capped = await ev(() => ChogUI._game()._debug.pickups.stats());
  ok('lives are capped at 3', capped.lives === 3 && capped.meter === 100, JSON.stringify(capped));
  ok('HUD meter says MAX', (await p.textContent('#dustCount')) === 'MAX');

  // ---------- Crash with a life, then without ----------
  await ev(() => { clearInterval(window.__keep); ChogUI._game()._debug.pickups._debug.addStardust(0); });
  await ev(() => { const pk = ChogUI._game()._debug.pickups; while (pk.stats().lives > 1) pk.tryUseLife(); });
  await p.waitForTimeout(2500);   // let the protection from those uses wear off
  await ev(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -2, false).keep = true; });
  await p.waitForTimeout(500);
  const afterHit = await ev(() => ({ state: ChogUI._game().state, lives: ChogUI._game()._debug.pickups.stats().lives, reviving: ChogUI._game()._debug.pickups.reviving() }));
  ok('a crash with a life continues the run', afterHit.state === 'playing' && afterHit.lives === 0 && afterHit.reviving, JSON.stringify(afterHit));
  await p.waitForTimeout(2500);
  await ev(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -2, false); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 }).catch(() => {});
  ok('a crash with no lives ends the run', await ev(() => ChogUI._game().state) === 'dead');
  ok('crash screen shows Stardust collected', /Stardust collected: \d+/.test(await p.textContent('#msg')));
  const last = await ev(() => Number(localStorage.getItem('chogDashLastM')));
  const shown = (await p.textContent('#msg')).match(/Distance: (\d+) m/);
  ok('last run distance saved', shown && last === Number(shown[1]), last);
  await p.waitForTimeout(700);
  await p.click('#hudMenuBtn'); await p.waitForTimeout(300);
  ok('home screen shows the last run distance', (await p.textContent('#lastValue')) === last.toLocaleString() + ' m');

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  const failed = checks.filter(c => !c).length;
  console.log((failed ? 'FAIL' : 'PASS') + ' pickups: ' + (checks.length - failed) + '/' + checks.length + ' checks');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
