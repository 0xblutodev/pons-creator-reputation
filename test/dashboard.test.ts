import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createApp } from "../src/server.js";
import { Store, type NewLaunch } from "../src/store.js";

const funder = "0x1111111111111111111111111111111111111111";
const recentA = "0x2222222222222222222222222222222222222222";
const recentB = "0x3333333333333333333333333333333333333333";
const older = "0x4444444444444444444444444444444444444444";

function launch(token: string, deployer: string, launchedAt: number, block: number): NewLaunch {
  return {
    token,
    curve: "0x9999999999999999999999999999999999999999",
    deployer,
    pairToken: null,
    launchConfigId: null,
    graduationThreshold: null,
    name: null,
    symbol: "SMP",
    launchBlock: block,
    launchTx: "0x" + "ab".repeat(32),
    launchedAt,
  };
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the wallet");
}

test("search renders the token table and the cluster line", async () => {
  const now = Math.floor(Date.now() / 1000);
  const store = new Store(":memory:");
  const rows = [
    ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", recentA, now - 2 * 86_400, 20],
    ["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", recentB, now - 3 * 86_400, 30],
    ["0xcccccccccccccccccccccccccccccccccccccccc", older, now - 30 * 86_400, 5],
  ] as const;
  for (const [token, deployer, launchedAt, block] of rows) {
    store.insertLaunch(launch(token, deployer, launchedAt, block));
    store.saveFunder({
      deployer,
      funder,
      amount: "1000000000000000000",
      tx: "0x" + "cd".repeat(32),
      timestamp: now - 40 * 86_400,
    });
  }

  const app = createApp(store, { clusterWindowDays: 7 });
  const html = await (await app.request("/")).text();
  assert.equal(html.toLowerCase().includes("alchemy"), false);
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1/",
    runScripts: "dangerously",
    beforeParse(window) {
      window.fetch = (async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(raw, "http://127.0.0.1");
        return app.request(url.pathname + url.search);
      }) as typeof fetch;
    },
  });

  try {
    const document = dom.window.document;
    const input = document.querySelector<HTMLInputElement>("#address");
    assert.ok(input);
    input.value = funder;
    document.querySelector("#search")?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(() => (document.querySelector("#cluster")?.textContent ?? "").includes("7-day cluster 2"));
    assert.match(document.querySelector("#cluster")?.textContent ?? "", /7-day cluster 2/);
    assert.equal(document.querySelectorAll("#tokens tbody tr").length, 3);
    assert.equal(document.querySelectorAll("#deployers li").length, 3);
    assert.match(document.querySelector("#deployers")?.textContent ?? "", /older/);
    assert.match(document.querySelector("#tokens")?.textContent ?? "", /SMP/);
  } finally {
    dom.window.close();
    store.close();
  }
});
