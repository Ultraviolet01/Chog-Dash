/*
 * Mock Chog Genesis contract (and Multicall3) for the browser tests.
 * rpc({ to, data }) answers an eth_call the way the real contract would.
 */
const viem = require('viem');
const Chain = require('../../js/chain.js');

const M3 = viem.parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])']);
const enc = (t, v) => viem.encodeAbiParameters(t.map(x => ({ type: x })), v);

function mockContract(owners, supply = 1969) {
  function rpc({ to, data }) {
    if (to.toLowerCase() === Chain.MULTICALL3) {
      const { args } = viem.decodeFunctionData({ abi: M3, data });
      return viem.encodeFunctionResult({ abi: M3, functionName: 'aggregate3', result: [args[0].map(c => {
        try { return { success: true, returnData: rpc({ to: c.target, data: c.callData }) }; }
        catch (e) { return { success: false, returnData: '0x7e273289' }; }
      })] });
    }
    const sel = data.slice(0, 10), arg = data.slice(10);
    const u = i => BigInt('0x' + arg.slice(i * 64, i * 64 + 64)), a = i => '0x' + arg.slice(i * 64 + 24, i * 64 + 64);
    if (sel === Chain.SEL.ownerOf) { const o = owners[u(0)]; if (!o) throw new Error('revert'); return enc(['address'], [o]); }
    if (sel === Chain.SEL.balanceOf) return enc(['uint256'], [BigInt(Object.values(owners).filter(o => o === a(0)).length)]);
    if (sel === Chain.SEL.totalSupply) return enc(['uint256'], [BigInt(supply)]);
    if (sel === Chain.SEL.supportsInterface) return enc(['bool'], [false]);   // like the real contract: not enumerable
    if (sel === Chain.SEL.tokenURI) return enc(['string'], ['ipfs://metacid/' + u(0)]);
    throw new Error('unexpected ' + sel);
  }
  return rpc;
}

module.exports = { mockContract };
