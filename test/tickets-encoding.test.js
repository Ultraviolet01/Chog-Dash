/* The browser's hand-written pool transaction encoding (js/tickets.js) matches viem's, so wallets send the right bytes. */
const test = require("node:test");
const assert = require("node:assert");
const { encodeFunctionData, encodeDeployData } = require("viem");
const T = require("../js/tickets.js");
const Pool = require("../js/pool-artifact.js");
const config = require("../js/config.js");

const erc20 = [
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];
const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222";

test("ticket purchase and approval encoding", () => {
  const ref = "0x" + "ab".repeat(32);
  assert.strictEqual(T.enc.buyTickets(906n * 10n ** 18n, ref), encodeFunctionData({ abi: Pool.abi, functionName: "buyTickets", args: [906n * 10n ** 18n, ref] }));
  assert.strictEqual(T.enc.approve(A, 123n), encodeFunctionData({ abi: erc20, functionName: "approve", args: [A, 123n] }));
  assert.strictEqual(T.enc.allowance(A, B), encodeFunctionData({ abi: erc20, functionName: "allowance", args: [A, B] }));
  assert.strictEqual(T.enc.balanceOf(A), encodeFunctionData({ abi: erc20, functionName: "balanceOf", args: [A] }));
});

test("pool owner encoding: pay winners, skip a week, deploy", () => {
  const winners = [A, B, "0x3333333333333333333333333333333333333333"], amounts = [250n, 180n, 130n];
  assert.strictEqual(T.enc.payWinners(2963, winners, amounts), encodeFunctionData({ abi: Pool.abi, functionName: "payWinners", args: [2963n, winners, amounts] }));
  assert.strictEqual(T.enc.payWinners(1, [A], [1n]), encodeFunctionData({ abi: Pool.abi, functionName: "payWinners", args: [1n, [A], [1n]] }));
  assert.strictEqual(T.enc.skipWeek(7), encodeFunctionData({ abi: Pool.abi, functionName: "skipWeek", args: [7n] }));
  assert.strictEqual(T.enc.available(9), encodeFunctionData({ abi: Pool.abi, functionName: "available", args: [9n] }));
  assert.strictEqual(T.enc.deploy(Pool.bytecode, config.tickets.token), encodeDeployData({ abi: Pool.abi, bytecode: Pool.bytecode, args: [config.tickets.token] }));
});

test("selectors match the compiled contract", () => {
  const { toFunctionSelector } = require("viem");
  for (const f of Pool.abi.filter(x => x.type === "function")) {
    if (T.SEL[f.name]) assert.strictEqual(T.SEL[f.name], toFunctionSelector(f), f.name);
  }
});

test("$CHOG amounts are shown in whole tokens", () => {
  assert.strictEqual(T.format(302n * 10n ** 18n), "302");
  assert.strictEqual(T.format(1234567n * 10n ** 17n, 1), "123,456.7");
});
