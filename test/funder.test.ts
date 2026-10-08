import assert from "node:assert/strict";
import test from "node:test";
import { alchemyFunderQuery, pickFunder, withinFunderBlock, type InboundNative } from "../src/chain/funding.js";

const deployer = "0x3333333333333333333333333333333333333333";
const early = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const later = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function row(patch: Partial<InboundNative> & Pick<InboundNative, "from" | "timestamp">): InboundNative {
  return {
    from: patch.from,
    to: patch.to,
    value: patch.value ?? 10n ** 18n,
    txHash: patch.txHash ?? "0x" + "ab".repeat(32),
    timestamp: patch.timestamp,
    blockNumber: patch.blockNumber ?? patch.timestamp,
  };
}

test("the earliest non-self native transfer is the funder", () => {
  const picked = pickFunder(
    [
      row({ from: deployer, timestamp: 10, txHash: "0x" + "11".repeat(32) }),
      row({ from: early, timestamp: 20, value: 2n * 10n ** 18n, txHash: "0x" + "22".repeat(32) }),
      row({ from: later, timestamp: 30, value: 9n * 10n ** 18n, txHash: "0x" + "33".repeat(32) }),
    ],
    deployer,
  );
  assert.equal(picked?.from, early);
  assert.equal(picked?.value, 2n * 10n ** 18n);
});

test("an earlier outbound transfer does not beat a later inbound one", () => {
  const outsider = "0xcccccccccccccccccccccccccccccccccccccccc";
  const picked = pickFunder(
    [
      row({ from: early, to: outsider, timestamp: 10, txHash: "0x" + "11".repeat(32) }),
      row({ from: "0x0000000000000000000000000000000000000000", to: deployer, timestamp: 15, txHash: "0x" + "22".repeat(32) }),
      row({ from: later, to: deployer, timestamp: 30, value: 4n * 10n ** 18n, txHash: "0x" + "33".repeat(32) }),
    ],
    deployer,
  );
  assert.equal(picked?.from, later);
  assert.equal(withinFunderBlock(row({ from: early, timestamp: 5, blockNumber: 50 }), 40n), false);
  assert.equal(withinFunderBlock(row({ from: early, timestamp: 5, blockNumber: 40 }), 40n), true);
});

test("alchemy asks for the earliest single inbound native transfer", () => {
  const query = alchemyFunderQuery(deployer, 1234n);
  assert.equal(query.toAddress, deployer);
  assert.deepEqual(query.category, ["external", "internal"]);
  assert.equal(query.order, "asc");
  assert.equal(query.maxCount, "0x1");
  assert.equal(query.toBlock, "0x4d2");
  assert.equal(query.excludeZeroValue, true);
});
