/*
 * Browser test of the full NFT flow against a MOCK wallet, MOCK contract and MOCK IPFS.
 * It proves the game's own logic, not the live collection.
 *   npm run test:browser            (set CHROME_PATH to a Chromium/Chrome binary if needed)
 *   node test/browser/nft-flow.e2e.js enum    (contract that supports enumeration)
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
const Chain = require(R + 'js/chain.js');

const acct = privateKeyToAccount('0x' + '11'.repeat(32));
const ME = acct.address.toLowerCase(), OTHER = '0x' + '22'.repeat(20);
const ENUM = process.argv[2] === 'enum';
const owners = { 1: ME, 2: ME, 5: OTHER };
const metas = {
  1: { name: 'Test Chog One', image: 'ipfs://imgcid/1.svg', attributes: [{ trait_type: 'Eyes', value: 'Laser Eyes' }, { trait_type: 'Tier', value: 'Rare' }, { trait_type: 'Background', value: 'Teal' }] },
  2: { name: 'Test Chog Two', image: 'ipfs://imgcid/2.svg', attributes: [{ trait_type: 'Eyes', value: 'Happy' }, { trait_type: 'Tier', value: 'Legendary' }] },
};
const svg = (bg, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${bg}"/><circle cx="200" cy="230" r="120" fill="#f5ead2" stroke="#111" stroke-width="8"/><polygon points="120,140 150,40 190,120" fill="#e83030"/><polygon points="210,120 250,40 280,140" fill="#e83030"/><rect x="120" y="200" width="160" height="26" fill="#d00"/><text x="200" y="330" font-size="28" text-anchor="middle" font-family="Arial">${label}</text></svg>`;
const enc = (t, v) => viem.encodeAbiParameters(t.map(x => ({ type: x })), v);
function rpc(data) {
  const sel = data.slice(0, 10), arg = data.slice(10);
  const u = i => BigInt('0x' + arg.slice(i * 64, i * 64 + 64)), a = i => '0x' + arg.slice(i * 64 + 24, i * 64 + 64);
  if (sel === Chain.SEL.ownerOf) { const o = owners[u(0)]; if (!o) throw new Error('revert'); return enc(['address'], [o]); }
  if (sel === Chain.SEL.balanceOf) return enc(['uint256'], [BigInt(Object.values(owners).filter(o => o === a(0)).length)]);
  if (sel === Chain.SEL.supportsInterface) return enc(['bool'], [ENUM && arg.startsWith('780e9d63')]);
  if (sel === Chain.SEL.tokenOfOwnerByIndex) return enc(['uint256'], [BigInt(Object.keys(owners).filter(i => owners[i] === a(0))[Number(u(1))])]);
  if (sel === Chain.SEL.tokenURI) return enc(['string'], ['ipfs://metacid/' + u(0)]);
  throw new Error('unexpected ' + sel);
}
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
  await p.exposeFunction('nodeRpc', d => rpc(d));
  await p.exposeFunction('nodeSign', hex => acct.signMessage({ message: { raw: hex } }));
  await p.addInitScript(addr => {
    window.ethereum = { on() {}, async request({ method, params }) {
      if (method === 'eth_requestAccounts') return [addr];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'eth_call') return window.nodeRpc(params[0].data);
      if (method === 'personal_sign') return window.nodeSign(params[0]);
      throw new Error('unsupported ' + method);
    } };
  }, acct.address);
  const shot = n => process.env.SHOTS && p.screenshot({ path: path.join(process.env.SHOTS, 'nft-' + (ENUM ? 'enum-' : '') + n + '.png') });
  const text = s => p.textContent(s);

  await p.goto('http://localhost:3456/');
  await p.waitForTimeout(800);
  await p.click('#modeNft'); await p.click('#playBtn'); await p.waitForTimeout(500);
  await p.click('#walletButtons button'); await p.waitForTimeout(800);
  console.log('wallet:', await text('#walletStatus'));
  console.log('holdings:', await text('#holdingsStatus'));
  if (ENUM) { await p.waitForTimeout(800); console.log('tiles:', await p.$$eval('.tok', t => t.map(x => x.textContent))); await shot('list'); await p.click('.tok >> nth=0'); }
  else {
    await p.fill('#tokenInput', '5'); await p.click('#tokenCheck'); await p.waitForTimeout(600);
    assert.match(await text('#chosenInfo'), /does not own token 5/);
    await p.fill('#tokenInput', '1'); await p.click('#tokenCheck');
  }
  await p.waitForFunction(() => !document.getElementById('rideBtn').disabled, null, { timeout: 15000 });
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
  assert.deepStrictEqual(errs, [], 'no page errors');
  console.log('PASS nft flow' + (ENUM ? ' (enumerable)' : ''));
  await b.close(); server.close();
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
