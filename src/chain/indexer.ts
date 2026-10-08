import { createPublicClient, getAddress, http, isAddress, type PublicClient } from "viem";
import { curveSellEvent, erc20Abi, poolGraduatedEvent, tokenLaunchedEvent, transferEvent } from "../abi.js";
import { PONS_FACTORY, lower } from "../addresses.js";
import type { Config } from "../config.js";
import { decideSurvival } from "../judge.js";
import type { Store } from "../store.js";
import { DAY_SECONDS, WEEK_SECONDS } from "../survival.js";
import { resolveFunder } from "./funding.js";
import { chunks, mapRange } from "./logs.js";
import { poolQuote, type PoolQuote } from "./market.js";
import { robinhoodChain } from "./network.js";

const factory = getAddress(PONS_FACTORY);

type DecodedLog = {
  eventName?: string;
  args?: Record<string, unknown> | readonly unknown[];
  address?: string;
  blockNumber?: bigint | null;
  transactionHash?: `0x${string}` | null;
  logIndex?: number | null;
};

function namedArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  return args as Record<string, unknown>;
}

function textArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

function bigintArg(args: Record<string, unknown>, key: string): bigint | null {
  const value = args[key];
  return typeof value === "bigint" ? value : null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sortLogs(logs: readonly DecodedLog[]): DecodedLog[] {
  return [...logs].sort((left, right) => {
    const blockDelta = Number((left.blockNumber ?? 0n) - (right.blockNumber ?? 0n));
    if (blockDelta !== 0) return blockDelta;
    return Number(left.logIndex ?? 0) - Number(right.logIndex ?? 0);
  });
}

function blockClock(client: PublicClient) {
  const cache = new Map<number, number>();
  return async (block: number): Promise<number> => {
    const hit = cache.get(block);
    if (hit != null) return hit;
    const header = await client.getBlock({ blockNumber: BigInt(block) });
    const timestamp = Number(header.timestamp);
    cache.set(block, timestamp);
    return timestamp;
  };
}

async function defaultStart(client: PublicClient, head: bigint, lookbackSeconds: number): Promise<bigint> {
  const sample = head > 200n ? 200n : head;
  if (sample === 0n) return 0n;
  const [latest, earlier] = await Promise.all([
    client.getBlock({ blockNumber: head }),
    client.getBlock({ blockNumber: head - sample }),
  ]);
  const elapsed = Number(latest.timestamp - earlier.timestamp);
  const perBlock = elapsed > 0 ? elapsed / Number(sample) : 0.25;
  const blocks = BigInt(Math.ceil(lookbackSeconds / perBlock));
  return head > blocks ? head - blocks : 0n;
}

async function readBalance(client: PublicClient, token: string, account: string): Promise<bigint | null> {
  try {
    return await client.readContract({
      address: getAddress(token),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [getAddress(account)],
    });
  } catch {
    return null;
  }
}

async function applyFactoryLogs(store: Store, client: PublicClient, logs: readonly DecodedLog[], clock: (block: number) => Promise<number>) {
  const fresh: string[] = [];
  for (const log of sortLogs(logs)) {
    const block = log.blockNumber == null ? null : Number(log.blockNumber);
    const tx = log.transactionHash ?? null;
    if (block == null || !tx) continue;
    const args = namedArgs(log.args);
    if (log.eventName === "TokenLaunched") {
      const token = textArg(args, "token");
      const curve = textArg(args, "curve");
      const deployer = textArg(args, "deployer");
      if (!token || !curve || !deployer) continue;
      const inserted = store.insertLaunch({
        token,
        curve,
        deployer,
        pairToken: textArg(args, "pairToken"),
        launchConfigId: bigintArg(args, "launchConfigId")?.toString() ?? null,
        graduationThreshold: bigintArg(args, "graduationThreshold")?.toString() ?? null,
        name: null,
        symbol: null,
        launchBlock: block,
        launchTx: tx,
        launchedAt: await clock(block),
      });
      if (inserted) fresh.push(lower(token));
      continue;
    }
    if (log.eventName === "PoolGraduated") {
      const token = textArg(args, "token");
      if (!token) continue;
      store.noteGraduated(token, block, await clock(block));
    }
  }

  for (const token of fresh) {
    try {
      const [name, symbol] = await Promise.all([
        client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "name" }),
        client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "symbol" }),
      ]);
      store.updateMeta(token, {
        name: typeof name === "string" ? name : null,
        symbol: typeof symbol === "string" ? symbol : null,
      });
    } catch (error) {
      console.error("[index] token meta", token, message(error));
    }
  }
}

async function scanCurveSells(
  client: PublicClient,
  store: Store,
  from: bigint,
  to: bigint,
  width: bigint,
  chunkStartTime: number,
  clock: (block: number) => Promise<number>,
) {
  const curves = store.listCurveWatch(Number(to), chunkStartTime).filter((row) => row.curve);
  const byDeployer = new Map<string, typeof curves>();
  for (const row of curves) {
    const group = byDeployer.get(row.deployer) ?? [];
    group.push(row);
    byDeployer.set(row.deployer, group);
  }
  for (const [deployer, rows] of byDeployer) {
    for (const batch of chunks(rows, 20)) {
      const byCurve = new Map(batch.map((row) => [row.curve, row]));
      const addresses = [...byCurve.keys()].map((curve) => getAddress(curve));
      const logs = (await mapRange(from, to, width, (start, end) =>
        client.getLogs({
          address: addresses,
          event: curveSellEvent,
          args: { seller: getAddress(deployer) },
          fromBlock: start,
          toBlock: end,
        }),
      )) as DecodedLog[];
      for (const log of logs) {
        const curve = log.address ? lower(log.address) : null;
        const row = curve ? byCurve.get(curve) : undefined;
        if (!row || log.blockNumber == null || !log.transactionHash) continue;
        const block = Number(log.blockNumber);
        store.noteExit(row.token, { block, at: await clock(block), tx: log.transactionHash });
      }
    }
  }
}

async function scanTransfers(
  client: PublicClient,
  store: Store,
  head: bigint,
  perBlock: number,
  width: bigint,
  clock: (block: number) => Promise<number>,
) {
  for (const row of store.listTransferWatch()) {
    if (!row.pool || !isAddress(row.pool) || row.graduationBlock == null) continue;
    const deadline = row.launchedAt + WEEK_SECONDS;
    if (row.graduatedAt != null && row.graduatedAt > deadline) {
      store.markPoolScanned(row.token);
      continue;
    }
    const span = BigInt(Math.ceil(WEEK_SECONDS / perBlock) + 1000);
    let end = BigInt(row.launchBlock) + span;
    if (end > head) end = head;
    const endTime = await clock(Number(end));
    if (endTime < deadline && end < head) end = head;
    const start = BigInt(row.graduationBlock);
    if (start > end) {
      store.markPoolScanned(row.token);
      continue;
    }
    try {
      const logs = (await mapRange(start, end, width, (from, to) =>
        client.getLogs({
          address: getAddress(row.token),
          event: transferEvent,
          args: { from: getAddress(row.deployer), to: getAddress(row.pool as string) },
          fromBlock: from,
          toBlock: to,
        }),
      )) as DecodedLog[];
      for (const log of logs) {
        if (log.blockNumber == null || !log.transactionHash) continue;
        const block = Number(log.blockNumber);
        const at = await clock(block);
        if (at > deadline) continue;
        store.noteExit(row.token, { block, at, tx: log.transactionHash });
      }
      store.markPoolScanned(row.token);
    } catch (error) {
      console.error("[index] transfer", row.token, message(error));
    }
  }
}

async function resolveFunders(store: Store, config: Config) {
  for (const row of store.listUncachedDeployers()) {
    try {
      const funder = await resolveFunder({
        httpUrl: config.alchemyHttp,
        blockscoutOrigin: config.blockscoutOrigin,
        deployer: row.deployer,
        toBlock: BigInt(row.firstLaunchBlock),
      });
      store.saveFunder({
        deployer: row.deployer,
        funder: funder?.from ?? null,
        amount: funder ? funder.value.toString() : null,
        tx: funder?.txHash ?? null,
        timestamp: funder?.timestamp ?? null,
      });
      console.log(`[index] funder ${row.deployer} ${funder?.from ?? "none"}`);
    } catch (error) {
      console.error("[index] funder", row.deployer, message(error));
    }
  }
}

async function reviewMarkets(
  client: PublicClient,
  store: Store,
  now: number,
  quotes: Map<string, PoolQuote | null>,
) {
  const due = store.listMarketDue(now, DAY_SECONDS, WEEK_SECONDS);
  for (const listed of due) {
    let quote = quotes.get(listed.token);
    if (quote === undefined) {
      try {
        quote = await poolQuote(listed.token);
      } catch (error) {
        console.error("[index] dexscreener", listed.token, message(error));
        quote = null;
      }
      quotes.set(listed.token, quote);
    }
    if (quote?.pairAddress && isAddress(quote.pairAddress)) store.setPool(listed.token, quote.pairAddress);
    const balance = await readBalance(client, listed.token, listed.deployer);
    if (listed.gradLiquidityUsd == null && quote?.liquidityUsd != null) {
      store.saveSnapshot(listed.token, {
        liquidityUsd: quote.liquidityUsd,
        creatorBalance: balance == null ? null : balance.toString(),
        at: now,
      });
    } else if (listed.gradCreatorBalance == null && balance != null) {
      store.saveSnapshot(listed.token, { liquidityUsd: null, creatorBalance: balance.toString(), at: now });
    }
  }
}

async function judgeSurvival(client: PublicClient, store: Store, now: number, quotes: Map<string, PoolQuote | null>) {
  const due = store.listMarketDue(now, DAY_SECONDS, WEEK_SECONDS);
  for (const listed of due) {
    const row = store.getLaunch(listed.token);
    if (!row?.graduatedAt || row.gradLiquidityUsd == null || row.gradSnapshotAt == null) continue;
    let quote = quotes.get(row.token);
    if (quote === undefined) {
      try {
        quote = await poolQuote(row.token);
      } catch (error) {
        console.error("[index] dexscreener", row.token, message(error));
        quote = null;
      }
      quotes.set(row.token, quote);
    }
    const balance = await readBalance(client, row.token, row.deployer);
    const flags = store.checkpointFlags(row.token);
    const windows = decideSurvival({
      now,
      graduatedAt: row.graduatedAt,
      snapshotAt: row.gradSnapshotAt,
      baselineLiquidity: row.gradLiquidityUsd,
      currentLiquidity: quote?.liquidityUsd ?? null,
      snapshotBalance: row.gradCreatorBalance == null ? null : BigInt(row.gradCreatorBalance),
      currentBalance: balance,
      creatorExited: row.sellStatus === "sold",
      done24h: flags.done24h,
      done7d: flags.done7d,
    });
    for (const window of windows) {
      store.saveCheckpoint({
        token: row.token,
        window: window.window,
        checkedAt: now,
        liquidityUsd: quote?.liquidityUsd ?? null,
        creatorBalance: balance == null ? null : balance.toString(),
        liquidityStayed: window.liquidityStayed,
        creatorDumped: window.creatorDumped,
        survived: window.survived,
      });
    }
  }
}

export async function runIndex(store: Store, config: Config): Promise<void> {
  if (!config.alchemyHttp) {
    console.warn("[index] ALCHEMY_HTTP_URL is not set; nothing was indexed");
    return;
  }

  const client = createPublicClient({
    chain: robinhoodChain(config.alchemyHttp),
    transport: http(config.alchemyHttp, { timeout: 30_000 }),
  });
  const clock = blockClock(client);
  const head = await client.getBlockNumber();
  const headTime = await clock(Number(head));
  const cursor = store.getCursor();
  let from = cursor != null ? BigInt(cursor) + 1n : (config.fromBlock ?? (await defaultStart(client, head, config.lookbackSeconds)));
  if (from < 0n) from = 0n;
  const width = BigInt(config.logChunkBlocks);
  const sample = head > 200n ? 200n : head;
  const earlier = sample === 0n ? headTime : await clock(Number(head - sample));
  const elapsed = headTime - earlier;
  const perBlock = sample > 0n && elapsed > 0 ? elapsed / Number(sample) : 0.25;

  console.log(`[index] ${from} -> ${head}`);
  while (from <= head) {
    const to = from + width - 1n > head ? head : from + width - 1n;
    const chunkStart = await clock(Number(from));
    const logs = (await mapRange(from, to, width, (start, end) =>
      client.getLogs({
        address: factory,
        events: [tokenLaunchedEvent, poolGraduatedEvent],
        fromBlock: start,
        toBlock: end,
      }),
    )) as DecodedLog[];
    await applyFactoryLogs(store, client, logs, clock);
    await scanCurveSells(client, store, from, to, width, chunkStart, clock);
    store.setCursor(Number(to));
    console.log(`[index] cursor ${to}`);
    from = to + 1n;
  }

  await resolveFunders(store, config);
  const quotes = new Map<string, PoolQuote | null>();
  await reviewMarkets(client, store, headTime, quotes);
  await scanTransfers(client, store, head, perBlock, width, clock);
  const held = store.markHeldBefore(headTime);
  if (held > 0) console.log(`[index] held ${held}`);
  await judgeSurvival(client, store, headTime, quotes);
}
