/*
 * End-to-end test of tickets and the weekly pool on a local fork of Monad mainnet (real $CHOG, a freshly deployed
 * pool contract). Needs Foundry's anvil running a fork:
 *   anvil --fork-url https://rpc.monad.xyz --port 8546      then      node test/browser/tickets-fork.e2e.js
 * (ANVIL_RPC overrides the URL). Skips if no fork is running. Not part of `npm run test:browser`.
 *
 * Flow: the pool owner deploys the contract from admin.html with their wallet and registers it; a player with
 * $CHOG buys 2 tickets in the game (approve + pay, credited from the on-chain event); the rocket takes off
 * (1 ticket spent); the run lands on the weekly board with its prize share; the pool holds the $CHOG. Then 8 days
 * pass (chain and server clocks): the admin page shows the finished week ready to pay and pays the winner their 25%;
 * the rest rolls over.
 * Chog NFT ownership and metadata are mocked (the test wallets don't own a Chog); everything else is real.
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
const { createChain } = require(R + 'lib/chain-server.js');
const { mockContract } = require('./mock-chain.js');
const config = require(R + 'js/config.js');
const Chain = require(R + 'js/chain.js');

const ANVIL = process.env.ANVIL_RPC || 'http://localhost:8546';
const CHOG = config.tickets.token;
const CHOG_HOLDER = '0x57390310FE6542dC2Ae696FfE5a6f56B84fC4229';   // a market holding $CHOG, impersonated on the fork
const admin = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');   // anvil #0
const player = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');  // anvil #1
const PL = player.address.toLowerCase();
const owners = { 7: PL };
const meta = { name: 'Fork Chog', image: 'ipfs://imgcid/7.svg', attributes: [{ trait_type: 'Tier', value: 'Rare' }] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#2a9d8f"/><circle cx="200" cy="230" r="120" fill="#f5ead2"/></svg>';
const launchOpts = { executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

async function rpc(method, params = []) {
  const res = await fetch(ANVIL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await res.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
  return j.result;
}
const erc20 = viem.parseAbi(['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const bal = async who => viem.decodeFunctionResult({ abi: erc20, functionName: 'balanceOf',
  data: await rpc('eth_call', [{ to: CHOG, data: viem.encodeFunctionData({ abi: erc20, functionName: 'balanceOf', args: [who] }) }, 'latest']) });

// A browser wallet for `acct`: signs with its key; transactions and chain reads go to the fork (anvil's accounts
// are unlocked), except the Chog NFT contract, which is mocked
function walletShim(page, acct, name) {
  const nft = mockContract(owners);
  return page.exposeFunction(name, async (method, params) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct.address];
    if (method === 'eth_chainId') return '0x8f';
    if (method === 'wallet_switchEthereumChain') return null;
    if (method === 'personal_sign') return acct.signMessage({ message: { raw: params[0] } });
    if (method === 'eth_call' && [config.collection.contract, Chain.MULTICALL3].includes(params[0].to.toLowerCase())) return nft(params[0]);
    return rpc(method, params);
  });
}
const installWallet = (page, name) => page.addInitScript(fn => {
  window.ethereum = { isMetaMask: true, on() {}, request: ({ method, params }) => window[fn](method, params || []) };
}, name);

(async () => {
  try { await rpc('eth_chainId'); } catch (e) { console.log('SKIP tickets fork test: no anvil fork at ' + ANVIL); return; }
  // Give the player 5,000 $CHOG and some MON for gas
  await rpc('anvil_impersonateAccount', [CHOG_HOLDER]);
  await rpc('anvil_setBalance', [CHOG_HOLDER, '0x56BC75E2D63100000']);
  const tx = await rpc('eth_sendTransaction', [{ from: CHOG_HOLDER, to: CHOG, data: viem.encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [PL, 5000n * 10n ** 18n] }) }]);
  assert.strictEqual((await rpc('eth_getTransactionReceipt', [tx])).status, '0x1');
  const start = await bal(PL);
  console.log('player $CHOG:', Number(start / 10n ** 18n));

  // The server: real fork chain for the pool and $CHOG, mocked Chog NFT, a fixed $CHOG price
  const real = createChain(ANVIL);
  const chain = Object.assign({}, real, {
    ownerOf: async id => { if (!owners[id]) throw new Error('revert'); return owners[id]; },
    tokenURI: async id => 'ipfs://metacid/' + id,
    balanceOf: async w => BigInt(Object.values(owners).filter(o => o === w.toLowerCase()).length),
    fetchMetadata: async () => meta,
    chogUsd: async () => 0.00166,
  });
  const store = memoryStore();
  let offset = 0;   // the server's clock, moved forward with the fork's
  const server = await startServer({ port: 3461, handlers: createHandlers({ store, chain, secret: 's', poolAdmin: admin.address, now: () => Date.now() + offset }) });
  const b = await chromium.launch(launchOpts);
  const errs = [];
  try {
    // ---------- The pool owner deploys and registers the pool from admin.html ----------
    const a = await b.newPage({ viewport: { width: 1100, height: 900 } });
    a.on('pageerror', e => errs.push('admin: ' + e.message));
    await walletShim(a, admin, 'adminWallet'); await installWallet(a, 'adminWallet');
    await a.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await a.goto('http://localhost:3461/admin.html');
    await a.waitForSelector('#wallets button', { timeout: 5000 });
    await a.click('#wallets button');
    await a.waitForFunction(() => /pool owner/.test(document.getElementById('walletStatus').textContent), null, { timeout: 15000 });
    assert.ok(await a.isVisible('#deployBtn'), 'not deployed yet');
    await a.click('#deployBtn');
    await a.waitForFunction(() => /Pool contract live/.test(document.getElementById('contractStatus').textContent), null, { timeout: 60000 });
    const pool = (await (await fetch('http://localhost:3461/api/pool')).json());
    console.log('deployed + registered:', pool.address, '| ticket', Number(BigInt(pool.perTicket) / 10n ** 18n), 'CHOG');
    assert.strictEqual(pool.enabled, true);
    assert.strictEqual(await real.pool(pool.address, 'owner').then(o => o.toLowerCase()), admin.address.toLowerCase(), 'owned by the admin wallet');
    assert.strictEqual(pool.perTicket, (302n * 10n ** 18n).toString(), '$0.50 at $0.00166 = 302 CHOG');
    if (process.env.SHOTS) await a.screenshot({ path: path.join(process.env.SHOTS, 'admin.png'), fullPage: true });

    // ---------- A player buys 2 tickets in the game ----------
    const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
    p.on('pageerror', e => errs.push('game: ' + e.message));
    await walletShim(p, player, 'playerWallet'); await installWallet(p, 'playerWallet');
    await p.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(R + 'node_modules/three/build/three.min.js'), contentType: 'application/javascript' }));
    await p.route('**/fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
    await p.route('**/ipfs/**', r => (r.request().url().includes('imgcid') ? r.fulfill({ body: svg, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' } })
      : r.fulfill({ body: JSON.stringify(meta), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } })));
    await p.goto('http://localhost:3461/');
    await p.waitForTimeout(800);
    await p.click('#modeNft'); await p.click('#playBtn'); await p.waitForTimeout(400);
    await p.click('#walletButtons button');
    await p.waitForFunction(() => document.querySelectorAll('.tok').length === 1, null, { timeout: 20000 });
    await p.fill('#pilotInput', 'Fork_Pilot'); await p.click('#pilotSave');
    await p.waitForFunction(() => document.getElementById('pilotStatus').textContent.includes('Saved'), null, { timeout: 5000 });
    await p.click('.tok[data-token="7"]');
    await p.waitForFunction(() => !document.getElementById('rideBtn').disabled, null, { timeout: 15000 });
    await p.click('#rideBtn');
    await p.waitForFunction(() => /No ticket/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
    assert.ok(await p.isVisible('#ticketBar'), 'ticket bar on the ready screen');
    assert.strictEqual(await p.textContent('#tbCount'), '0');
    if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'tickets-ready-empty.png') });
    await p.click('#tbBuy');
    await p.waitForFunction(() => /302 CHOG/.test(document.getElementById('tkPrice').textContent), null, { timeout: 10000 });
    await p.waitForFunction(() => /Your wallet: 5,000 CHOG/.test(document.getElementById('tkBal').textContent), null, { timeout: 10000 });
    await p.click('#tkPlus');
    assert.match(await p.textContent('#tkTotal'), /604 CHOG/);
    if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'tickets-panel.png') });
    await p.click('#tkBuyBtn');
    await p.waitForFunction(() => /2 tickets added/.test(document.getElementById('tkStatus').textContent), null, { timeout: 90000 });
    console.log('bought:', await p.textContent('#tkStatus'));
    assert.strictEqual(await p.textContent('#tkHave'), '2');
    if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'tickets-bought.png') });
    const paid = start - await bal(PL);
    assert.strictEqual(paid, 604n * 10n ** 18n, 'the wallet paid 2 x 302 CHOG');
    assert.strictEqual(await bal(pool.address), 604n * 10n ** 18n, 'the pool holds it');

    // ---------- Fly: one ticket spent at take-off; the run lands on the weekly board ----------
    await p.click('#tkBack');
    await p.waitForFunction(() => /uses 1 of your 2 tickets/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
    await p.keyboard.press('Space');
    await p.waitForTimeout(1500);
    assert.strictEqual(await p.evaluate(() => ChogUI._state.tickets), 1, 'a ticket was used at take-off');
    await p.evaluate(() => { const g = ChogUI._game()._debug; for (let i = 0; i < 3; i++) { const q = g.player.position; g.spawnAt(q.x, q.y + 0.35, -1 - i * 40, true); } });
    await p.waitForFunction(() => /This week: total distance \d+ m .*rank 1/.test(document.getElementById('goRank').textContent), null, { timeout: 20000 });
    console.log('end:', await p.textContent('#goRank'));
    await p.click('#endLbBtn');
    await p.waitForFunction(() => document.querySelectorAll('#lbPanel .lb-entry').length === 1 && /25%/.test(document.getElementById('lbPodium').textContent), null, { timeout: 10000 });
    console.log('weekly board:', (await p.textContent('#lbWeek')).replace(/\s+/g, ' ').trim());
    assert.match(await p.textContent('#lbWeekInfo'), /Pool 604 CHOG/);
    await p.waitForTimeout(1200);
    if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'tickets-board.png') });

    // ---------- 8 days later: the owner pays the finished week from admin.html ----------
    const DAYS8 = 8 * 86400;
    await rpc('evm_increaseTime', ['0x' + DAYS8.toString(16)]); await rpc('evm_mine');
    offset = DAYS8 * 1000;
    const before = await bal(PL);
    await a.reload();
    await a.waitForSelector('#wallets button', { timeout: 5000 });
    await a.click('#wallets button');   // signs in again (the earlier sign-in has expired)
    await a.waitForFunction(() => /READY TO PAY/.test(document.getElementById('weekInfo').textContent), null, { timeout: 20000 });
    console.log('admin week:', (await a.textContent('#weekInfo')).replace(/\s+/g, ' ').trim(), '|', await a.textContent('#weekStatus'));
    assert.match(await a.textContent('#winners'), /Fork_Pilot.*25%.*151 CHOG/s);
    if (process.env.SHOTS) await a.screenshot({ path: path.join(process.env.SHOTS, 'admin-pay.png'), fullPage: true });
    await a.click('#payBtn');
    await a.waitForFunction(() => /PAID/.test(document.getElementById('weekInfo').textContent), null, { timeout: 60000 });
    const won = await bal(PL) - before;
    console.log('winner received:', Number(won) / 1e18, 'CHOG; pool keeps', Number(await bal(pool.address)) / 1e18, 'CHOG for next week');
    assert.strictEqual(won, 151n * 10n ** 18n, '25% of 604 CHOG');
    assert.strictEqual(await bal(pool.address), 453n * 10n ** 18n, 'the unearned shares roll over');
    assert.ok(await a.isDisabled('#payBtn'), "can't pay the same week twice");
    assert.deepStrictEqual(errs, [], 'no page errors');
    console.log('PASS tickets on a Monad fork: deploy, buy with real $CHOG, ticket at take-off, weekly board, payout');
  } finally {
    await b.close(); server.close();
  }
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
