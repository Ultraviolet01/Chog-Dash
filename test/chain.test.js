const test = require("node:test");
const assert = require("node:assert");
const { encodeAbiParameters } = require("viem");
const Chain = require("../js/chain.js");

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

// Fake EIP-1193 provider answering the contract reads Chain uses
function fakeProvider({ owners, enumerable, uris }) {
  const enc = (types, vals) => encodeAbiParameters(types.map(t => ({ type: t })), vals);
  return {
    async request({ method, params }) {
      assert.strictEqual(method, "eth_call");
      const data = params[0].data, sel = data.slice(0, 10), arg = data.slice(10);
      const uintArg = i => BigInt("0x" + arg.slice(i * 64, i * 64 + 64));
      const addrArg = i => "0x" + arg.slice(i * 64 + 24, i * 64 + 64);
      if (sel === Chain.SEL.ownerOf) {
        const o = owners[uintArg(0)];
        if (!o) throw new Error("execution reverted: nonexistent token");
        return enc(["address"], [o]);
      }
      if (sel === Chain.SEL.balanceOf) return enc(["uint256"], [BigInt(Object.values(owners).filter(o => o === addrArg(0)).length)]);
      if (sel === Chain.SEL.supportsInterface) return enc(["bool"], [enumerable && arg.startsWith("780e9d63")]);
      if (sel === Chain.SEL.tokenOfOwnerByIndex) {
        const mine = Object.keys(owners).filter(id => owners[id] === addrArg(0));
        return enc(["uint256"], [BigInt(mine[Number(uintArg(1))])]);
      }
      if (sel === Chain.SEL.tokenURI) return enc(["string"], [uris[uintArg(0)]]);
      throw new Error("unexpected call " + sel);
    },
  };
}

test("tokenURI strings decode exactly, including unicode", async () => {
  const p = fakeProvider({ owners: { 7: OWNER }, uris: { 7: "ipfs://bafyTEST/7", 8: "ipfs://x/é" } });
  assert.strictEqual(await Chain.reads.tokenURI(p, 7n), "ipfs://bafyTEST/7");
  assert.strictEqual(await Chain.reads.tokenURI(p, 8n), "ipfs://x/é");
});

test("ownership is verified against ownerOf", async () => {
  const p = fakeProvider({ owners: { 5: OWNER, 6: OTHER }, uris: {} });
  assert.deepStrictEqual((await Chain.verifyOwnership(p, 5n, OWNER.toUpperCase().replace("0X", "0x"))).owned, true);
  const r = await Chain.verifyOwnership(p, 6n, OWNER);
  assert.strictEqual(r.owned, false);
  assert.match(r.reason, /does not own token 6/);
  const missing = await Chain.verifyOwnership(p, 99n, OWNER);
  assert.strictEqual(missing.owned, false);
  assert.match(missing.reason, /does not exist/);
});

test("holdings are listed only when the contract is enumerable", async () => {
  const owners = { 3: OWNER, 10: OTHER, 12: OWNER };
  const e = await Chain.listOwnedTokens(fakeProvider({ owners, enumerable: true, uris: {} }), OWNER);
  assert.deepStrictEqual(e.tokenIds.map(String), ["3", "12"]);
  const ne = await Chain.listOwnedTokens(fakeProvider({ owners, enumerable: false, uris: {} }), OWNER);
  assert.strictEqual(ne.enumerable, false);
  assert.strictEqual(ne.balance, 2n);
  assert.deepStrictEqual(ne.tokenIds, []);
});
