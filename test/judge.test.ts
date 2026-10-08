import assert from "node:assert/strict";
import test from "node:test";
import { decideSurvival } from "../src/judge.js";
import { DAY_SECONDS, WEEK_SECONDS } from "../src/survival.js";

const graduatedAt = 1_700_000_000;

function input(patch: Partial<Parameters<typeof decideSurvival>[0]> = {}) {
  return {
    now: graduatedAt + WEEK_SECONDS,
    graduatedAt,
    snapshotAt: graduatedAt + 60,
    baselineLiquidity: 100,
    currentLiquidity: 80,
    snapshotBalance: 100n,
    currentBalance: 100n,
    creatorExited: false,
    done24h: false,
    done7d: false,
    ...patch,
  };
}

test("a missing quote is left open", () => {
  assert.deepEqual(decideSurvival(input({ currentLiquidity: null })), []);
});

test("24h can close while 7d is still running", () => {
  const judged = decideSurvival(input({ now: graduatedAt + DAY_SECONDS, currentLiquidity: 40, currentBalance: 80n }));
  assert.deepEqual(
    judged.map((window) => window.window),
    ["24h"],
  );
  assert.equal(judged[0]?.survived, false);
  assert.equal(judged[0]?.liquidityStayed, false);
  assert.equal(judged[0]?.creatorDumped, true);
});

test("a covered window survives when liquidity held and the creator did not dump", () => {
  const judged = decideSurvival(input());
  assert.equal(judged.length, 2);
  assert.equal(judged.every((window) => window.survived), true);
});

test("a snapshot taken after the window cannot close it", () => {
  const judged = decideSurvival(input({ snapshotAt: graduatedAt + DAY_SECONDS, now: graduatedAt + DAY_SECONDS }));
  assert.deepEqual(judged, []);
});
