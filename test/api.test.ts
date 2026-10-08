import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/server.js";
import { Store, type NewLaunch } from "../src/store.js";

const now = 1_700_000_000;
const funder = "0x1111111111111111111111111111111111111111";
const recentA = "0x2222222222222222222222222222222222222222";
const older = "0x4444444444444444444444444444444444444444";
const busy = "0x5555555555555555555555555555555555555555";
const selective = "0x6666666666666666666666666666666666666666";

function launch(token: string, deployer: string, launchedAt: number, block: number): NewLaunch {
  return {
    token,
    curve: "0x9999999999999999999999999999999999999999",
    deployer,
    pairToken: null,
    launchConfigId: null,
    graduationThreshold: null,
    name: "Sample",
    symbol: "SMP",
    launchBlock: block,
    launchTx: "0x" + "ab".repeat(32),
    launchedAt,
  };
}

test("wallet search and the leaderboard read the index", async () => {
  const store = new Store(":memory:");
  store.insertLaunch(launch("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", recentA, now - 86_400, 10));
  store.insertLaunch(launch("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", older, now - 30 * 86_400, 4));
  store.saveFunder({ deployer: recentA, funder, amount: "1", tx: "0x" + "cd".repeat(32), timestamp: now - 86_400 });
  store.saveFunder({
    deployer: older,
    funder: recentA,
    amount: "2",
    tx: "0x" + "ef".repeat(32),
    timestamp: now - 40 * 86_400,
  });

  const seed = (deployer: string, count: number, survived: number, prefix: string) => {
    for (let index = 0; index < count; index += 1) {
      const token = `0x${prefix}${(index + 1).toString(16).padStart(2, "0")}${"00".repeat(18)}`;
      store.insertLaunch(launch(token, deployer, now - index, 50 + index));
      store.noteGraduated(token, 60 + index, now - index);
      store.saveCheckpoint({
        token,
        window: "7d",
        checkedAt: now,
        liquidityUsd: 10,
        creatorBalance: "1",
        liquidityStayed: index < survived,
        creatorDumped: false,
        survived: index < survived,
      });
    }
  };
  seed(busy, 6, 1, "ab");
  seed(selective, 3, 2, "ac");

  const app = createApp(store, { clusterWindowDays: 7, now: () => now, html: "<p>reputation</p>" });

  const missing = await app.request("/api/wallets/0x9999999999999999999999999999999999999999");
  assert.equal(missing.status, 200);
  const empty = (await missing.json()) as { deployer: null; funder: null };
  assert.equal(empty.deployer, null);
  assert.equal(empty.funder, null);
  assert.equal((await app.request("/api/wallets/nope")).status, 400);

  const both = await app.request(`/api/wallets/${recentA}`);
  const body = (await both.json()) as {
    deployer: { clusterSize: number; tokens: { token: string; sell: { status: string } }[] };
    funder: { clusterSize: number; deployers: { address: string }[] };
  };
  assert.equal(body.deployer.tokens.length, 1);
  assert.equal(body.deployer.tokens[0]?.sell.status, "open");
  assert.equal(body.funder.clusterSize, 0);
  assert.equal(body.funder.deployers[0]?.address, older);

  const board = await app.request("/api/leaderboard?limit=10");
  const creators = ((await board.json()) as { creators: { deployer: string; launches: number; survival7d: number }[] }).creators;
  assert.equal(creators[0]?.deployer, selective);
  assert.equal(creators[1]?.deployer, busy);
  assert.ok((creators[0]?.launches ?? 0) < (creators[1]?.launches ?? 0));
  assert.equal(creators[0]?.survival7d, 2 / 3);
  await store.close();
});
