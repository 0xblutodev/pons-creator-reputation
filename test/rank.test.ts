import assert from "node:assert/strict";
import test from "node:test";
import { median, rankCreators, type CreatorStats } from "../src/rank.js";

function creator(patch: Partial<CreatorStats> & Pick<CreatorStats, "deployer">): CreatorStats {
  return {
    deployer: patch.deployer,
    funder: patch.funder ?? null,
    launches: patch.launches ?? 3,
    graduated: patch.graduated ?? 3,
    judged24h: patch.judged24h ?? 3,
    survived24h: patch.survived24h ?? 3,
    judged7d: patch.judged7d ?? 3,
    survived7d: patch.survived7d ?? 3,
    sellSeconds: patch.sellSeconds ?? [],
    clusterSize: patch.clusterSize ?? 0,
  };
}

test("a higher 7-day survival rate ranks first when launch counts differ", () => {
  const busy = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const selective = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const ranked = rankCreators([
    creator({
      deployer: busy,
      launches: 12,
      graduated: 10,
      judged24h: 8,
      survived24h: 4,
      judged7d: 6,
      survived7d: 2,
      sellSeconds: [10],
      clusterSize: 4,
    }),
    creator({
      deployer: selective,
      launches: 3,
      graduated: 3,
      judged24h: 3,
      survived24h: 2,
      judged7d: 3,
      survived7d: 2,
      sellSeconds: [400, 100],
      clusterSize: 1,
    }),
  ]);
  assert.equal(ranked[0]?.deployer, selective);
  assert.equal(ranked[1]?.deployer, busy);
  assert.ok((ranked[0]?.launches ?? 0) < (ranked[1]?.launches ?? 0));
  assert.equal(ranked[0]?.medianSellSeconds, 250);
  assert.equal(ranked[0]?.clusterSize, 1);
});

test("fewer than 3 judged 7-day launches stay off the board", () => {
  const ranked = rankCreators([
    creator({ deployer: "0xcccccccccccccccccccccccccccccccccccccccc", judged7d: 2, survived7d: 2 }),
  ]);
  assert.deepEqual(ranked, []);
});

test("median uses the sold launches only", () => {
  assert.equal(median([]), null);
  assert.equal(median([4, 1, 9]), 4);
  assert.equal(median([1, 3]), 2);
});
