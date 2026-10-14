/*
 * Clicks every button in the game and checks each does what it should.
 * Runs against the real dev server, with a MOCK wallet (starting on the wrong network),
 * MOCK contract and MOCK IPFS. Static buttons: hudMenuBtn, laserBtn, walletChip, modePractice,
 * modeNft, playBtn, lbBtn, howBtn, howBack, nftBack, switchNet, signInBtn (via auto sign-in), pilotSave, rideBtn, lbBack.
 * Dynamic buttons: wallet connect buttons and Chog tiles.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const R = path.join(__dirname, '../../') + '/';
const { startServer } = require(R + 'server/dev.js');
const { createHandlers } = require(R + 'lib/handlers.js');
const { memoryStore } = require(R + 'lib/store.js');
const { mockContract } = require('./mock-chain.js');

const acct = privateKeyToAccount('0x' + '11'.repeat(32));
const ME = acct.address.toLowerCase();
const owners = { 1: ME, 2: ME, 5: '0x' + '22'.repeat(20) };
const metas = {
  1: { name: 'Test Chog One', image: 'ipfs://imgcid/1.svg', attributes: [{ trait_type: 'Eyes', value: 'Purple laser' }, { trait_type: 'Tier', value: 'Rare' }] },
  2: { name: 'Test Chog Two', image: 'ipfs://imgcid/2.svg', attributes: [{ trait_type: 'Eyes', value: 'Happy' }, { trait_type: 'Tier', value: 'Legendary' }] },
};
const svg = c => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${c}"/><circle cx="100" cy="110" r="60" fill="#f5ead2"/></svg>`;
const rpc = mockContract(owners);
const chain = {
  ownerOf: async id => { if (!owners[id]) throw new Error('revert'); return owners[id]; },
  tokenURI: async id => 'ipfs://metacid/' + id,
  fetchMetadata: async uri => metas[uri.split('/').pop()],
  verifySignature: args => viem.verifyMessage(args),
};

const checks = [];
function ok(name, cond, detail) {
  checks.push({ name, pass: !!cond });
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
}

(async () => {
  const server = await startServer({ port: 3457, handlers: createHandlers({ store: memoryStore(), chain, secret: 's' }) });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(R + 'node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.route('**/ipfs/**', r => {
    const u = r.request().url();
    if (u.includes('imgcid')) return r.fulfill({ body: svg(u.includes('1.svg') ? '#2a9d8f' : '#e9c46a'), contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' } });
    const id = u.split('/').pop();
    return metas[id] ? r.fulfill({ body: JSON.stringify(metas[id]), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 404 });
  });
  await p.exposeFunction('nodeRpc', c => rpc(c));
  await p.exposeFunction('nodeSign', hex => acct.signMessage({ message: { raw: hex } }));
  await p.addInitScript(addr => {
    let chainId = '0x1';   // start on the wrong network
    const listeners = {};
    window.ethereum = {
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      async request({ method, params }) {
        if (method === 'eth_requestAccounts') return [addr];
        if (method === 'eth_chainId') return chainId;
        if (method === 'wallet_switchEthereumChain') { chainId = params[0].chainId; (listeners.chainChanged || []).forEach(f => f(chainId)); return null; }
        if (method === 'eth_call') return window.nodeRpc(params[0]);
        if (method === 'personal_sign') return window.nodeSign(params[0]);
        throw new Error('unsupported ' + method);
      },
    };
  }, acct.address);
  const text = s => p.textContent(s);
  const visible = s => p.isVisible(s);
  const state = () => p.evaluate(() => ChogUI._game().state);
  const panelShown = id => p.evaluate(id => document.getElementById(id).classList.contains('show'), id);

  await p.goto('http://localhost:3457/');
  await p.waitForTimeout(1200);

  // ---------- Home screen ----------
  ok('home screen shows on load', await panelShown('menuPanel'));
  await p.click('#modeNft');
  ok('modeNft: switch highlights CHOG NFT', await p.evaluate(() => document.getElementById('modeNft').classList.contains('on')));
  ok('modeNft: PLAY becomes PICK CHOG', (await text('#playBtn')) === 'PICK CHOG');
  ok('modeNft: hint explains NFT mode', /Ride a Chog you own/.test(await text('#modeHint')));
  await p.click('#modePractice');
  ok('modePractice: switch highlights PRACTICE', await p.evaluate(() => document.getElementById('modePractice').classList.contains('on')));
  // Switching modes must not move or resize the big button (no bump)
  const playBox = () => p.evaluate(() => { const r = document.getElementById('playBtn').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height), Math.round(r.width)].join(','); });
  const boxPractice = await playBox();
  await p.click('#modeNft'); await p.waitForTimeout(500);
  const boxNft = await playBox();
  ok('PLAY and PICK CHOG keep the same size and position', boxPractice === boxNft, boxPractice + ' vs ' + boxNft);
  ok('mode pill slid under CHOG NFT', await p.evaluate(() => { const pill = document.getElementById('modePill').getBoundingClientRect(), b = document.getElementById('modeNft').getBoundingClientRect(); return Math.abs(pill.left - b.left) < 2 && Math.abs(pill.width - b.width) < 2; }));
  await p.click('#modePractice'); await p.waitForTimeout(500);
  ok('modePractice: PLAY label back', (await text('#playBtn')) === 'PLAY');
  ok('modePractice: hint explains practice', /Rookie/.test(await text('#modeHint')));

  await p.click('#howBtn'); await p.waitForTimeout(200);
  ok('howBtn opens How to play on page 1 (Fly)', await panelShown('howPanel') && (await text('#howStep')) === '1 / 5' && /FLY/.test(await text('#howPanel')));
  ok('page 1 shows keyboard keys and the mouse on desktop', (await p.$$('#howControls .keycap')).length === 8 && !!(await p.$('#howControls .how-mouse')));
  await p.click('#howNext'); await p.waitForTimeout(450);
  ok('howNext goes to page 2', (await text('#howStep')) === '2 / 5');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(450);
  ok('arrow key goes to page 3 (pickups with real icons)', (await text('#howStep')) === '3 / 5' && (await p.$$('#howPickups .pk img')).length === 8);
  await p.click('#howPrev'); await p.waitForTimeout(450);
  ok('howPrev goes back', (await text('#howStep')) === '2 / 5');
  await p.click('#howDots button:nth-child(5)'); await p.waitForTimeout(450);
  ok('dots jump to the last page, where Next becomes PLAY', (await text('#howStep')) === '5 / 5' && (await text('#howNext')) === 'PLAY');
  ok('zones page lists all five zones with lengths', /Outer Space 2 min/.test((await text('#howZones')).replace(/\s+/g, ' ')) && (await p.$$('#howZones .zn')).length === 5);
  await p.click('#howBack'); await p.waitForTimeout(200);
  ok('howBack returns home', await panelShown('menuPanel') && !(await panelShown('howPanel')));
  // Sound: the mute button and M key toggle sound, and the choice is remembered
  const muted0 = await p.evaluate(() => ChogAudio.isMuted());
  await p.click('#muteBtn'); await p.waitForTimeout(100);
  ok('muteBtn toggles sound', (await p.evaluate(() => ChogAudio.isMuted())) === !muted0 && (await p.evaluate(() => document.body.classList.contains('muted'))) === !muted0);
  ok('mute choice is remembered', (await p.evaluate(() => localStorage.getItem('chogDashMuted'))) === (!muted0 ? '1' : '0'));
  await p.keyboard.press('KeyM'); await p.waitForTimeout(100);
  ok('M key toggles sound back', (await p.evaluate(() => ChogAudio.isMuted())) === muted0);
  ok('audio engine running after a click', await p.evaluate(() => !!ChogAudio._ctx() && ChogAudio._ctx().state === 'running'));

  await p.click('#lbBtn'); await p.waitForTimeout(600);
  ok('lbBtn opens leaderboard', await panelShown('lbPanel'), await text('#lbStatus'));
  ok('leaderboard loads from server (empty board message)', /No pilots yet/.test(await text('#lbList')));
  ok('own standing bar shown when signed out', /Not signed in/.test(await text('#lbMe')));
  await p.click('#lbBack'); await p.waitForTimeout(200);
  ok('lbBack returns home', await panelShown('menuPanel'));

  // ---------- Practice: PLAY, HUD menu button, Space shortcuts ----------
  await p.click('#playBtn'); await p.waitForTimeout(400);
  ok('playBtn (practice) opens the ready screen', (await state()) === 'ready' && /PRACTICE MODE/.test(await text('#msg')));
  ok('practice HUD has no LASER button', !(await visible('#laserBtn')));
  ok('hudMenuBtn visible on ready screen', await visible('#hudMenuBtn'));
  await p.click('#hudMenuBtn'); await p.waitForTimeout(300);
  ok('hudMenuBtn (ready) returns home', await panelShown('menuPanel') && (await state()) === 'menu');
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  ok('Space on home screen plays', (await state()) === 'ready');
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  ok('Space on ready screen starts the run', (await state()) === 'playing');
  ok('hudMenuBtn hidden while flying', !(await visible('#hudMenuBtn')));
  // Crash on purpose
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -6, false); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 });
  ok('crash shows result', /CRASHED/.test(await text('#msg')));
  ok('Menu button hidden on the game-over screen (Home replaces it)', !(await visible('#hudMenuBtn')));
  await p.waitForTimeout(700);
  await p.click('#endHomeBtn'); await p.waitForTimeout(300);
  ok('endHomeBtn (practice) returns home', await panelShown('menuPanel') && (await state()) === 'menu');
  ok('best chip updated after the run', /\d+ m/.test(await text('#bestValue')), await text('#bestValue'));

  // ---------- NFT: wallet chip, connect, switch network, tiles, token entry, ride ----------
  await p.click('#walletChip'); await p.waitForTimeout(500);
  ok('walletChip opens Chog NFT panel', await panelShown('nftPanel'));
  await p.click('#nftBack'); await p.waitForTimeout(200);
  ok('nftBack returns home', await panelShown('menuPanel'));
  await p.click('#modeNft'); await p.click('#playBtn'); await p.waitForTimeout(500);
  ok('PICK CHOG opens Chog NFT panel', await panelShown('nftPanel'));
  await p.click('#walletButtons button'); await p.waitForTimeout(600);
  ok('wallet connect button connects', /Connected/.test(await text('#walletStatus')), await text('#walletStatus'));
  ok('wrong network detected, switchNet shown', await visible('#switchNet') && /chain 1/.test(await text('#walletStatus')));
  await p.click('#switchNet'); await p.waitForTimeout(800);
  await p.waitForFunction(() => /Signed in/.test(document.getElementById('walletStatus').textContent), null, { timeout: 10000 });
  ok('switchNet switches to Monad, then signing in runs automatically', /on Monad/.test(await text('#walletStatus')) && !(await visible('#switchNet')), await text('#walletStatus'));
  ok('pilot name card shown after sign-in', await visible('#pilotCard'));
  await p.waitForFunction(() => document.querySelectorAll('.tok').length >= 2, null, { timeout: 10000 });
  await p.waitForTimeout(1500);   // let any second load finish, then make sure nothing is duplicated
  const tiles = await p.$$eval('.tok', t => t.map(x => x.textContent));
  ok('Chog tiles listed once each', tiles.length === 2, String(tiles));
  await p.click('.tok >> nth=1');
  await p.waitForFunction(() => !document.getElementById('rideBtn').disabled, null, { timeout: 15000 });
  ok('tile click selects that Chog', (await text('#chosenName')) === 'Test Chog Two' && /Legendary/.test(await text('#chosenInfo')));
  ok('token 5 (another wallet) is not listed', !tiles.some(t => /token 5\)/.test(t)));
  await p.click('.tok >> nth=0');
  await p.waitForFunction(() => !document.getElementById('rideBtn').disabled, null, { timeout: 15000 });
  ok('first tile selects the Laser Eyes Chog', /Laser Eyes, 10 charges/.test(await text('#chosenInfo')));
  await p.click('#rideBtn'); await p.waitForTimeout(400);
  ok('rideBtn asks for a pilot name first', /pilot name/.test(await text('#rideStatus')) && (await state()) === 'menu');
  await p.fill('#pilotInput', 'x'); await p.click('#pilotSave'); await p.waitForTimeout(200);
  ok('pilotSave rejects a short name', /3 to 16/.test(await text('#pilotStatus')));
  await p.fill('#pilotInput', 'Rocket_Chog'); await p.press('#pilotInput', 'Enter');
  await p.waitForFunction(() => /Saved/.test(document.getElementById('pilotStatus').textContent), null, { timeout: 5000 });
  ok('Enter in pilot box saves the name', /Rocket_Chog/.test(await text('#walletStatus')));
  await p.click('#rideBtn');
  await p.waitForFunction(() => /Eligible/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  ok('rideBtn opens an eligible NFT run', /CHOG NFT MODE/.test(await text('#msg')));
  ok('LASER button shown for a Laser Eyes Chog', await visible('#laserBtn'));

  await p.click('#gameCanvas'); await p.waitForTimeout(300);
  ok('click on the game starts the run', (await state()) === 'playing');
  await p.click('#laserBtn'); await p.waitForTimeout(200);
  ok('laserBtn fires (10 -> 9)', (await text('#laserCount')) === '9/10');
  await p.click('#laserBtn'); await p.waitForTimeout(200);
  ok('laserBtn fires again (9 -> 8)', (await text('#laserCount')) === '8/10');
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 });
  await p.waitForFunction(() => !/Submitting/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  ok('NFT run submitted and validated', /Validated/.test(await text('#msg')), (await text('#msg')).slice(0, 120));
  ok('game over shows PLAY AGAIN, Share run, Ranks and Home', await visible('#againBtn') && await visible('#cardBtn') && await visible('#endLbBtn') && await visible('#endHomeBtn'));
  await p.waitForTimeout(700);   // retries are ignored for 0.6 s after a crash, so a frantic click doesn't skip the result
  await p.click('#againBtn');
  await p.waitForFunction(() => ChogUI._game().state === 'playing', null, { timeout: 10000 });
  ok('againBtn restarts straight away (after the run session for a ranked run)', (await state()) === 'playing' && !(await visible('#endBar')));
  ok('laser charges reset to 10 on a new run', (await text('#laserCount')) === '10/10');
  ok('the restarted NFT run is registered for the leaderboard', await p.evaluate(() => !!ChogUI._state.activeRunId));
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 });
  await p.waitForFunction(() => !/Submitting/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await p.waitForTimeout(700);
  await p.keyboard.press('KeyR');
  await p.waitForFunction(() => ChogUI._game().state === 'playing', null, { timeout: 10000 }).catch(() => {});
  ok('R restarts after a crash', (await state()) === 'playing');
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 });
  await p.waitForFunction(() => !/Submitting/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await p.waitForTimeout(700);
  await p.click('#endLbBtn'); await p.waitForTimeout(600);
  ok('endLbBtn opens the leaderboard', await panelShown('lbPanel') && (await state()) === 'menu');
  await p.click('#lbBack'); await p.waitForTimeout(300);
  await p.click('#playBtn');
  await p.waitForFunction(() => ChogUI._game().state === 'ready', null, { timeout: 15000 });
  await p.keyboard.press('Space');
  await p.waitForFunction(() => ChogUI._game().state === 'playing', null, { timeout: 5000 });
  await p.evaluate(() => { const d = ChogUI._game()._debug, q = d.player.position; d.spawnAt(q.x, q.y + 0.35, -1, true); });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 5000 });
  await p.waitForTimeout(700);

  // ---------- Back home with a Chog chosen ----------
  await p.click('#endHomeBtn'); await p.waitForTimeout(300);
  ok('endHomeBtn goes home', await panelShown('menuPanel') && (await state()) === 'menu');
  ok('home in NFT mode shows PLAY once a Chog is chosen', (await text('#playBtn')) === 'PLAY' && /Test Chog One/.test(await text('#modeHint')));
  ok('best chip shows the Chog best total distance', (await text('#bestLabel')) === 'BEST TOTAL' && / m$/.test(await text('#bestValue')));
  ok('wallet chip shows pilot name with green dot', (await text('#walletChipText')) === 'Rocket_Chog' && await p.evaluate(() => document.getElementById('walletDot').classList.contains('on')));
  await p.click('#playBtn');
  await p.waitForFunction(() => ChogUI._game().state === 'ready', null, { timeout: 15000 });
  ok('PLAY rides the chosen Chog directly', /Test Chog One/.test(await text('#msg')));
  await p.click('#hudMenuBtn'); await p.waitForTimeout(300);
  await p.click('#lbBtn'); await p.waitForTimeout(800);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#lbPanel .lb-entry')].map(e => ({ rank: (e.querySelector('.medal') || e.querySelector('.rk')).textContent, who: e.querySelector('.who').textContent, chog: e.querySelector('.chog').textContent, total: e.querySelector('.big').textContent, mine: e.classList.contains('mine') })));
  ok('leaderboard podium shows username, Chog and total distance', rows.length === 1 && rows[0].rank === '1' && rows[0].who === 'Rocket_Chog' && /Test Chog One/.test(rows[0].chog) && /^[\d,]+m$/.test(rows[0].total), JSON.stringify(rows));
  ok('own row highlighted', rows[0].mine);
  ok('own standing pinned at the bottom', /YOU#1Rocket_Chog/.test((await text('#lbMe')).replace(/\s/g, '')), await text('#lbMe'));
  await p.click('#lbRefresh'); await p.waitForTimeout(600);
  ok('lbRefresh reloads the board', (await p.$$('#lbPanel .lb-entry')).length === 1);
  await p.click('#lbBack');

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); server.close();
  const failed = checks.filter(c => !c.pass);
  console.log((failed.length ? 'FAIL' : 'PASS') + ' buttons: ' + (checks.length - failed.length) + '/' + checks.length + ' checks');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
