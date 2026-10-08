import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { isAddress } from "viem";
import type { Config } from "./config.js";
import type { Store } from "./store.js";

const pagePath = join(dirname(fileURLToPath(import.meta.url)), "../web/index.html");

function numberQuery(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createApp(store: Store, options: { clusterWindowDays?: number; html?: string; now?: () => number } = {}) {
  const windowDays = options.clusterWindowDays ?? 7;
  const html = options.html ?? readFileSync(pagePath, "utf8");
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/api/wallets/:address", (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
    return c.json(store.wallet(address, now(), windowDays));
  });

  app.get("/api/leaderboard", (c) => {
    const limit = Math.min(200, Math.max(1, Math.floor(numberQuery(c.req.query("limit"), 50))));
    return c.json({ creators: store.leaderboard(now(), limit, windowDays) });
  });

  app.get("/", (c) => c.html(html));
  return app;
}

export function startServer(store: Store, config: Config) {
  const app = createApp(store, { clusterWindowDays: config.clusterWindowDays });
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[server] http://localhost:${info.port}`);
  });
}
