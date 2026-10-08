import assert from "node:assert/strict";
import test from "node:test";
import { DAY_SECONDS, WEEK_SECONDS } from "../src/survival.js";
import { Store, type NewLaunch } from "../src/store.js";

const now = 1_700_000_000;
const funder = "0x1111111111111111111111111111111111111111";
const recentA = "0x2222222222222222222222222222222222222222";
const recentB = "0x3333333333333333333333333333333333333333";
const older = "0x4444444444444444444444444444444444444444";

function launch(token: string, deployer: string, launchedAt: number, block: number): NewLaunch {
  return {
    token,
    curve: "0x" + token.slice(2, 10) + "0".repeat(32),
    deployer,
    pairToken: null,
    launchConfigId: "1",
    graduationThreshold: "1000",
    name: null,
    symbol: null,
    launchBlock: block,
    launchTx: "0x" + "ab".repeat(32),
    launchedAt,
  };
}

test("two recent deployers make a cluster of 2 and the older deployer stays listed", () => {
  const store = new Store(":memory:");
  store.insertLaunch(launch("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", recentA, now - 2 * 86_400, 20));
  store.insertLaunch(launch("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", recentB, now - 3 * 86_400, 30));
  store.insertLaunch(launch("0xcccccccccccccccccccccccccccccccccccccccc", older, now - 30 * 86_400, 5));
  for (const deployer of [recentA, recentB, older]) {
    store.saveFunder({
      deployer,
      funder,
      amount: "1000000000000000000",
      tx: "0x" + "cd".repeat(32),
      timestamp: now - 40 * 86_400,
    });
  }

  const page = store.wallet(funder, now, 7);
  assert.equal(page.deployer, null);
  assert.equal(page.funder?.clusterSize, 2);
  assert.equal(page.funder?.deployers.length, 3);
  const listed = new Set(page.funder?.deployers.map((row) => row.address));
  assert.equal(listed.has(older), true);
  assert.equal(page.funder?.deployers.find((row) => row.address === older)?.inCluster, false);
  assert.equal(page.funder?.deployers.filter((row) => row.inCluster).length, 2);

  const creator = store.wallet(recentA, now, 7);
  assert.equal(creator.deployer?.funder?.address, funder);
  assert.equal(creator.deployer?.clusterSize, 2);
  assert.equal(creator.deployer?.tokens.length, 1);
  store.close();
});

test("leaderboard order follows 7-day survival rate when launch counts differ", () => {
  const store = new Store(":memory:");
  const busy = "0x5555555555555555555555555555555555555555";
  const selective = "0x6666666666666666666666666666666666666666";
  const quiet = "0x7777777777777777777777777777777777777777";

  const seed = (deployer: string, count: number, survived: number, prefix: string) => {
    for (let index = 0; index < count; index += 1) {
      const token = `0x${prefix}${(index + 1).toString(16).padStart(2, "0")}${"0".repeat(36)}`;
      store.insertLaunch(launch(token, deployer, now - index * 86_400, 100 + index));
      store.noteGraduated(token, 110 + index, now - index * 86_400 + 10);
      store.saveCheckpoint({
        token,
        window: "7d",
        checkedAt: now,
        liquidityUsd: 50,
        creatorBalance: "100",
        liquidityStayed: index < survived,
        creatorDumped: index >= survived,
        survived: index < survived,
      });
      store.saveCheckpoint({
        token,
        window: "24h",
        checkedAt: now,
        liquidityUsd: 50,
        creatorBalance: "100",
        liquidityStayed: true,
        creatorDumped: false,
        survived: true,
      });
    }
  };

  seed(busy, 8, 2, "aa");
  seed(selective, 3, 2, "bb");
  seed(quiet, 2, 2, "cc");

  const board = store.leaderboard(now, 10, 7);
  assert.equal(board.length, 2);
  assert.equal(board[0]?.deployer, selective);
  assert.equal(board[1]?.deployer, busy);
  assert.ok((board[0]?.launches ?? 0) < (board[1]?.launches ?? 0));
  assert.equal(board[0]?.survival7d, 2 / 3);
  assert.equal(board[1]?.survival7d, 2 / 8);
  store.close();
});

test("no sell after 7 days is held, and an earlier exit replaces that", () => {
  const store = new Store(":memory:");
  const deployer = "0x8888888888888888888888888888888888888888";
  const token = "0xdddddddddddddddddddddddddddddddddddddddd";
  const launchedAt = now - 8 * 86_400;
  store.insertLaunch(launch(token, deployer, launchedAt, 4));
  assert.equal(store.markHeldBefore(now), 1);
  assert.equal(store.wallet(deployer, now, 7).deployer?.tokens[0]?.sell.status, "held");
  store.noteExit(token, { block: 9, at: launchedAt + 15, tx: "0x" + "ee".repeat(32) });
  const sold = store.wallet(deployer, now, 7).deployer?.tokens[0]?.sell;
  assert.equal(sold?.status, "sold");
  assert.equal(sold?.seconds, 15);
  store.close();
});

test("a late liquidity snapshot cannot be judged, and a held mark waits for the pool scan", () => {
  const store = new Store(":memory:");
  const deployer = "0x9999999999999999999999999999999999999999";
  const late = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const covered = "0xabababababababababababababababababababab";
  const waiting = "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd";
  const graduatedAt = now - 8 * 86_400;
  store.insertLaunch(launch(late, deployer, graduatedAt - 100, 1));
  store.noteGraduated(late, 2, graduatedAt);
  store.setPool(late, "0x5656565656565656565656565656565656565656");
  store.markPoolScanned(late);
  store.saveSnapshot(late, { liquidityUsd: 10, creatorBalance: "5", at: graduatedAt + WEEK_SECONDS + 10 });
  store.insertLaunch(launch(covered, deployer, graduatedAt - 50, 3));
  store.noteGraduated(covered, 4, graduatedAt);
  store.saveSnapshot(covered, { liquidityUsd: 10, creatorBalance: "5", at: graduatedAt + 60 });
  store.setPool(covered, "0x1212121212121212121212121212121212121212");
  store.insertLaunch(launch(waiting, deployer, now - WEEK_SECONDS, 8));
  store.noteGraduated(waiting, 9, now - WEEK_SECONDS + 10);
  store.setPool(waiting, "0x3434343434343434343434343434343434343434");

  const due = store.listMarketDue(now, DAY_SECONDS, WEEK_SECONDS).map((row) => row.token);
  assert.equal(due.includes(late), false);
  assert.equal(due.includes(covered), true);
  const open = () => store.wallet(deployer, now, 7).deployer?.tokens.find((row) => row.token === waiting)?.sell.status;
  assert.equal(store.markHeldBefore(now), 1);
  assert.equal(open(), "open");
  store.markPoolScanned(waiting);
  assert.equal(store.markHeldBefore(now), 1);
  assert.equal(open(), "held");
  store.close();
});
