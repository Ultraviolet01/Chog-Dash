/*
 * Browser test of the full NFT flow against a MOCK wallet, MOCK contract and MOCK IPFS.
 * It proves the game's own logic, not the live collection.
 *   npm run test:browser            (set CHROME_PATH to a Chromium/Chrome binary if needed)
 * Flow: connect, decline sign-in once, sign in, Chogs found by the Multicall3 scan, pilot name,
 * ride, validated run, leaderboard shows the pilot name.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '../../') + '/';
const launchOpts = { executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const assert = require('assert');
const viem = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { startServer } = require(R + 'server/dev.js');
const { createHandlers } = require(R + 'lib/handlers.js');
const { memoryStore } = require(R + 'lib/store.js');
const { mockContract } = require('./mock-chain.js');

const acct = privateKeyToAccount('0x' + '11'.repeat(32));
const ME = acct.address.toLowerCase(), OTHER = '0x' + '22'.repeat(20);
const owners = { 1: ME, 1500: ME, 5: OTHER };   // 1500 is in a later scan batch
const metas = {
  1: { name: 'Test Chog One', image: 'ipfs://imgcid/1.svg', attributes: [{ trait_type: 'Eyes', value: 'Purple laser' }, { trait_type: 'Tier', value: 'Rare' }, { trait_type: 'Background', value: 'Teal' }] },
  1500: { name: 'Test Chog Two', image: 'ipfs://imgcid/2.svg', attributes: [{ trait_type: 'Eyes', value: 'Happy' }, { trait_type: 'Tier', value: 'Legendary' }] },
};
const svg = (bg, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${bg}"/><circle cx="200" cy="230" r="120" fill="#f5ead2" stroke="#111" stroke-width="8"/><polygon points="120,140 150,40 190,120" fill="#e83030"/><polygon points="210,120 250,40 280,140" fill="#e83030"/><rect x="120" y="200" width="160" height="26" fill="#d00"/><text x="200" y="330" font-size="28" text-anchor="middle" font-family="Arial">${label}</text></svg>`;
const rpc = mockContract(owners);
const chain = {
  ownerOf: async id => { if (!owners[id]) throw new Error('revert'); return owners[id]; },
  tokenURI: async id => 'ipfs://metacid/' + id,
  fetchMetadata: async uri => metas[uri.split('/').pop()],
  verifySignature: args => viem.verifyMessage(args),
};

(async () => {
  const server = await startServer({ port: 3456, handlers: createHandlers({ store: memoryStore(), chain, secret: 's' }) });
  const b = await chromium.launch(launchOpts);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const three = fs.readFileSync(R + 'node_modules/three/build/three.min.js');
  await p.route('**/three.min.js', r => r.fulfill({ body: three, contentType: 'application/javascript' }));
  await p.route('**/ipfs/**', r => {
    const u = r.request().url();
    if (u.includes('imgcid')) return r.fulfill({ body: svg(u.includes('1.svg') ? '#2a9d8f' : '#e9c46a', u.includes('1.svg') ? 'TEST ART 1' : 'TEST ART 2'), contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' } });
    const id = u.split('/').pop();
    return metas[id] ? r.fulfill({ body: JSON.stringify(metas[id]), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 404 });
  });
  await p.exposeFunction('nodeRpc', c => rpc(c));
  await p.exposeFunction('nodeSign', hex => acct.signMessage({ message: { raw: hex } }));
  await p.addInitScript(addr => {
    window.ethereum = { on() {}, async request({ method, params }) {
      if (method === 'eth_requestAccounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_call') return window.nodeRpc(params[0]);
      if (method === 'personal_sign') {
        if (!window.__declined) { window.__declined = true; throw Object.assign(new Error('User rejected'), { code: 4001 }); }
        return window.nodeSign(params[0]);
      }
      throw new Error('unsupported ' + method);
    } };
  }, acct.address);
  const shot = n => process.env.SHOTS && p.screenshot({ path: path.join(process.env.SHOTS, 'nft-' + n + '.png') });
  const text = s => p.textContent(s);

  await p.goto('http://localhost:3456/');
  await p.waitForTimeout(800);
  await p.click('#modeNft'); await p.click('#playBtn'); await p.waitForTimeout(500);
  await p.click('#walletButtons button'); await p.waitForTimeout(800);
  // First signature request is declined: no Chogs shown, a Sign in button appears
  console.log('declined:', await text('#walletStatus'));
  assert.match(await text('#walletStatus'), /declined/);
  assert.ok(await p.isVisible('#signInBtn'), 'sign in button shown');
  assert.ok(!(await p.isVisible('#holdingsCard')), 'no Chogs before signing in');
  await p.click('#signInBtn');
  await p.waitForFunction(() => document.querySelectorAll('.tok').length === 2, null, { timeout: 15000 });
  console.log('wallet:', await text('#walletStatus'));
  console.log('holdings:', await text('#holdingsStatus'));
  assert.match(await text('#walletStatus'), /Signed in as 0x/);
  assert.match(await text('#holdingsStatus'), /Found 2 Chogs/);
  assert.deepStrictEqual(await p.$$eval('.tok', t => t.map(x => x.dataset.token)), ['1', '1500'], 'only this wallet\'s Chogs');
  assert.ok(await p.isVisible('#pilotCard'), 'pilot name card shown');
  await p.waitForTimeout(600);
  await shot('list');
  await p.click('.tok[data-token="1"]');
  await p.waitForFunction(() => !document.getElementById('rideBtn').disabled, null, { timeout: 15000 });
  // Riding needs a pilot name
  await p.click('#rideBtn'); await p.waitForTimeout(400);
  assert.match(await text('#rideStatus'), /pilot name/);
  await p.fill('#pilotInput', '9bad'); await p.click('#pilotSave'); await p.waitForTimeout(200);
  assert.match(await text('#pilotStatus'), /starting with a letter/);
  await p.fill('#pilotInput', 'Test_Pilot'); await p.click('#pilotSave');
  await p.waitForFunction(() => document.getElementById('pilotStatus').textContent.includes('Saved'), null, { timeout: 5000 });
  assert.match(await text('#walletStatus'), /Signed in as Test_Pilot/);
  assert.strictEqual(await text('#walletChipText'), 'Test_Pilot');
  await shot('pilot');
  console.log('chosen:', await text('#chosenInfo'));
  console.log('traits:', await p.$$eval('#traitRows tr', r => r.map(x => x.textContent)));
  await shot('chosen');
  await p.click('#rideBtn');
  await p.waitForFunction(() => document.getElementById('msg').textContent.includes('Eligible'), null, { timeout: 15000 });
  assert.match(await text('#msg'), /Laser Eyes: 10 charges/);
  console.log('badge:', await text('#modeBadge'));
  await shot('ready');
  await p.keyboard.down('Space'); await p.waitForTimeout(500); await p.keyboard.up('Space');
  await p.keyboard.press('KeyE');
  await p.waitForTimeout(1200);
  await shot('play');
  console.log('hud:', await text('#score'), '|', await text('#laserBox'));
  await p.waitForFunction(() => document.getElementById('msg').textContent.includes('CRASHED'), null, { timeout: 60000 });
  await p.waitForFunction(() => !document.getElementById('msg').textContent.includes('Submitting'), null, { timeout: 15000 });
  const end = await text('#msg');
  console.log('end:', end);
  assert.match(end, /Validated\. Server score \d+ \(x1\.15\), rank 1/);
  await shot('end');
  await p.click('#hudMenuBtn'); await p.click('#lbBtn'); await p.waitForTimeout(600);
  console.log('lb:', await p.$$eval('#lbRows tr', r => r.map(x => x.textContent)));
  await shot('lb');
  const lb = await p.$$eval('#lbRows tr', r => r.map(x => x.textContent));
  assert.strictEqual(lb.length, 1, 'one leaderboard entry');
  assert.match(lb[0], /^1Test_Pilot[\d,]+ m$/, 'leaderboard shows the username and distance');
  assert.deepStrictEqual(errs, [], 'no page errors');
  console.log('PASS nft flow');
  await b.close(); server.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
