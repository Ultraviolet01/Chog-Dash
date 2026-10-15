/*
 * Browser test of the DEMO leaderboard: a wallet with no Chog connects, signs in, picks a pilot name, flies a demo
 * Chog, and its server-checked run shows on the DEMO tab of Ranks, not on the Chog NFT board.
 * MOCK wallet, contract and IPFS; real handlers and in-memory store.
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

const acct = privateKeyToAccount('0x' + '33'.repeat(32));
const owners = { 7: '0x' + '44'.repeat(20) };   // this wallet owns nothing
const chain = {
  ownerOf: async id => { if (!owners[id]) throw new Error('revert'); return owners[id]; },
  tokenURI: async id => 'ipfs://metacid/' + id,
  fetchMetadata: async () => null,
  balanceOf: async () => 0n,
  verifySignature: args => viem.verifyMessage(args),
};
const svg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#7a3dd6"/><circle cx="200" cy="230" r="120" fill="#f5ead2"/><text x="200" y="330" font-size="28" text-anchor="middle" font-family="Arial">${n}</text></svg>`;

(async () => {
  const store = memoryStore();
  const server = await startServer({ port: 3457, handlers: createHandlers({ store, chain, secret: 's' }) });
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(R + 'node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
  await p.route('**/ipfs/**', r => r.fulfill({ body: svg(r.request().url().split('/').pop()), contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' } }));
  const rpc = mockContract(owners);
  await p.exposeFunction('nodeRpc', c => rpc(c));
  await p.exposeFunction('nodeSign', hex => acct.signMessage({ message: { raw: hex } }));
  await p.addInitScript(addr => {
    window.ethereum = { on() {}, async request({ method, params }) {
      if (method === 'eth_requestAccounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_call') return window.nodeRpc(params[0]);
      if (method === 'personal_sign') return window.nodeSign(params[0]);
      throw new Error('unsupported ' + method);
    } };
  }, acct.address);
  const shot = n => process.env.SHOTS && p.screenshot({ path: path.join(process.env.SHOTS, 'demoboard-' + n + '.png') });
  const text = s => p.textContent(s);

  await p.goto('http://localhost:3457/');
  await p.waitForTimeout(800);
  await p.click('#modeDemo'); await p.click('#playBtn');
  await p.waitForFunction(() => document.querySelectorAll('#demoList .demo-card img').length === 5, null, { timeout: 10000 });
  assert.match(await text('#demoAccount'), /Connect any wallet/);
  // Connect a wallet with no Chog, sign in, pick a pilot name
  await p.click('#demoAccount button'); await p.waitForTimeout(500);
  await p.click('#walletButtons button');
  await p.waitForFunction(() => /holds no Chog Genesis NFTs/.test(document.getElementById('holdingsStatus').textContent), null, { timeout: 15000 });
  assert.match(await text('#holdingsStatus'), /DEMO tab/);
  await p.fill('#pilotInput', 'Judge_One'); await p.click('#pilotSave');
  await p.waitForFunction(() => /Saved/.test(document.getElementById('pilotStatus').textContent), null, { timeout: 5000 });
  await p.click('#nftBack'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('#demoPanel'), 'back to the demo picker');
  assert.match(await text('#demoAccount'), /Judge_One: your demo runs go on the DEMO leaderboard/);
  await shot('picker');

  // Fly the Legendary demo Chog: the server issues a demo run session
  await p.click('#demoList .demo-card[data-token="1798"]');
  await p.waitForFunction(() => /DEMO leaderboard as Judge_One/.test(document.getElementById('msg').textContent), null, { timeout: 10000 });
  assert.match(await text('#msg'), /Tier Legendary x1\.4/);
  await p.keyboard.press('Space'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = ChogUI._game()._debug; for (let i = 0; i < 3; i++) { const q = g.player.position; g.spawnAt(q.x, q.y + 0.35, -1 - i * 40, true); } });
  await p.waitForFunction(() => ChogUI._game().state === 'dead', null, { timeout: 20000 });
  await p.waitForFunction(() => /DEMO leaderboard: total distance \d+ m, rank 1/.test(document.getElementById('goRank').textContent), null, { timeout: 10000 });
  const end = await text('#goRank');
  console.log('end:', end);
  const total = Number(end.match(/DEMO leaderboard: total distance (\d+) m/)[1]);
  assert.strictEqual(await p.evaluate(() => ChogUI._state.lastRun.rank), 1, 'run card gets the demo rank');
  await shot('end');

  // Ranks opens on the DEMO tab in demo mode
  await p.click('#endLbBtn');
  await p.waitForFunction(() => document.querySelectorAll('#lbPanel .lb-entry').length === 1, null, { timeout: 5000 });
  assert.ok(await p.evaluate(() => document.getElementById('lbTabDemo').classList.contains('on')));
  assert.match(await text('#lbSub'), /DEMO RUNS/);
  const row = await p.evaluate(() => { const e = document.querySelector('#lbPanel .lb-entry'); return { who: e.querySelector('.who .nm').textContent, chog: e.querySelector('.chog').textContent, big: e.querySelector('.big').textContent }; });
  console.log('demo board:', JSON.stringify(row), '| me:', await text('#lbMe'));
  assert.deepStrictEqual([row.who, row.big], ['Judge_One', total.toLocaleString() + 'm']);
  assert.match(row.chog, /Krown · Legendary x1\.40/);
  assert.match(await text('#lbMe'), /#1/);
  await shot('board');
  // The Chog NFT board stays untouched
  await p.click('#lbTabNft');
  await p.waitForFunction(() => /No pilots yet/.test(document.getElementById('lbList').textContent), null, { timeout: 5000 });
  assert.deepStrictEqual(await store.top(10), []);
  assert.deepStrictEqual(errs, [], 'no page errors');
  console.log('PASS demo leaderboard');
  await b.close(); server.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
