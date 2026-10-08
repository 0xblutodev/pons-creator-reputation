import assert from "node:assert/strict";
import test from "node:test";
import { decodeEventLog, encodeAbiParameters, encodeEventTopics, keccak256, toBytes, type Hex } from "viem";
import { factoryAbi } from "../src/abi.js";
import { PONS_FACTORY } from "../src/addresses.js";

const token = "0x1111111111111111111111111111111111111111";
const curve = "0x2222222222222222222222222222222222222222";
const deployer = "0x3333333333333333333333333333333333333333";
const pairToken = "0x0000000000000000000000000000000000000000";

function asTopics(topics: readonly (Hex | readonly Hex[] | null | undefined)[]): [Hex, ...Hex[]] {
  const flat = topics.filter((topic): topic is Hex => typeof topic === "string");
  const [signature, ...rest] = flat;
  if (!signature) throw new Error("missing event topic");
  return [signature, ...rest];
}

test("TokenLaunched round-trips and the third indexed topic is the deployer", () => {
  assert.equal(PONS_FACTORY, "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
  const topics = encodeEventTopics({
    abi: factoryAbi,
    eventName: "TokenLaunched",
    args: { token, curve, deployer },
  });
  assert.equal(topics[0], keccak256(toBytes("TokenLaunched(address,address,address,address,uint256,uint256)")));
  const deployerTopic = topics[3];
  assert.equal(typeof deployerTopic, "string");
  assert.equal(String(deployerTopic).toLowerCase(), `0x${deployer.slice(2).padStart(64, "0")}`);

  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
    [pairToken, 7n, 42n * 10n ** 17n],
  );
  const decoded = decodeEventLog({
    abi: factoryAbi,
    eventName: "TokenLaunched",
    topics: asTopics(topics),
    data,
  });
  assert.equal(decoded.args.deployer.toLowerCase(), deployer);
  assert.equal(decoded.args.token.toLowerCase(), token);
  assert.equal(decoded.args.curve.toLowerCase(), curve);
  assert.equal(decoded.args.launchConfigId, 7n);
  assert.equal(decoded.args.graduationThreshold, 42n * 10n ** 17n);
  const names = factoryAbi.flatMap((item) => (item.type === "event" ? [item.name] : []));
  assert.deepEqual(names, ["TokenLaunched", "PoolGraduated"]);
});
