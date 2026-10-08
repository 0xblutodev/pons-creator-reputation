import { hexToBigInt, parseUnits, type Hex } from "viem";
import { isZeroAddress, lower, sameAddress } from "../addresses.js";

/**
 * The deployer's earliest inbound native ETH.
 * This is not the exemption scanner's 60-minute pre-launch payment window.
 */
export type InboundNative = {
  from: string;
  to?: string;
  value: bigint;
  txHash: string;
  timestamp: number;
  blockNumber: number;
};

type AlchemyTransfer = {
  from?: string;
  to?: string;
  hash?: string;
  value?: number | null;
  blockNum?: string;
  metadata?: { blockTimestamp?: string };
  rawContract?: { value?: string | null; decimal?: string | number | null };
};

export type ScoutTx = {
  from?: string;
  to?: string;
  value?: string;
  hash?: string;
  transaction_hash?: string;
  timeStamp?: string;
  timestamp?: string;
  blockNumber?: string;
  isError?: string;
};

export function alchemyFunderQuery(deployer: string, toBlock: bigint): Record<string, unknown> {
  return {
    fromBlock: "0x0",
    toBlock: `0x${toBlock.toString(16)}`,
    toAddress: lower(deployer),
    category: ["external", "internal"],
    order: "asc",
    maxCount: "0x1",
    withMetadata: true,
    excludeZeroValue: true,
  };
}

/** A missing block number is kept; a known block after the launch is not this deployer's seed. */
export function withinFunderBlock(row: InboundNative, toBlock: bigint): boolean {
  if (row.blockNumber <= 0) return true;
  return BigInt(row.blockNumber) <= toBlock;
}

/** Earliest inbound transfer with value, ignoring the deployer and the zero address. */
export function pickFunder(transfers: readonly InboundNative[], deployer: string): InboundNative | null {
  const candidates = transfers.filter((row) => {
    if (row.value <= 0n) return false;
    if (!row.from || isZeroAddress(row.from)) return false;
    if (sameAddress(row.from, deployer)) return false;
    if (row.to && !sameAddress(row.to, deployer)) return false;
    return true;
  });
  candidates.sort((left, right) => left.timestamp - right.timestamp || left.blockNumber - right.blockNumber);
  return candidates[0] ?? null;
}

function decimalsOf(raw: string | number | null | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.startsWith("0x")) {
    try {
      return Number(BigInt(raw));
    } catch {
      return 18;
    }
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 18;
}

export function alchemyValue(transfer: AlchemyTransfer): bigint {
  const raw = transfer.rawContract?.value;
  if (typeof raw === "string" && /^0x[0-9a-fA-F]+$/.test(raw)) {
    try {
      return hexToBigInt(raw as Hex);
    } catch {
      return 0n;
    }
  }
  if (typeof transfer.value === "number" && transfer.value > 0) {
    const text = String(transfer.value);
    if (!/[eE]/.test(text)) {
      try {
        return parseUnits(text, decimalsOf(transfer.rawContract?.decimal));
      } catch {
        return 0n;
      }
    }
  }
  return 0n;
}

export function parseAlchemyTransfers(transfers: readonly AlchemyTransfer[]): InboundNative[] {
  const rows: InboundNative[] = [];
  for (const transfer of transfers) {
    if (!transfer.from || !transfer.hash) continue;
    const timestamp = transfer.metadata?.blockTimestamp ? Date.parse(transfer.metadata.blockTimestamp) / 1000 : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    let blockNumber = 0;
    if (typeof transfer.blockNum === "string" && transfer.blockNum.startsWith("0x")) {
      try {
        blockNumber = Number(BigInt(transfer.blockNum));
      } catch {
        blockNumber = 0;
      }
    }
    rows.push({
      from: lower(transfer.from),
      value: alchemyValue(transfer),
      txHash: transfer.hash.toLowerCase(),
      timestamp: Math.floor(timestamp),
      blockNumber,
    });
  }
  return rows;
}

export function parseScoutTxs(rows: readonly ScoutTx[], recipient?: string): InboundNative[] {
  const parsed: InboundNative[] = [];
  for (const row of rows) {
    if (row.isError === "1") continue;
    const from = row.from;
    const hash = row.hash ?? row.transaction_hash;
    if (recipient && (!row.to || !sameAddress(row.to, recipient))) continue;
    if (!from || !hash || typeof row.value !== "string") continue;
    let value: bigint;
    try {
      value = BigInt(row.value);
    } catch {
      continue;
    }
    const stamp = row.timeStamp ?? row.timestamp;
    const timestamp = stamp == null ? NaN : Number.isFinite(Number(stamp)) ? Number(stamp) : Date.parse(stamp) / 1000;
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    const blockNumber = Number(row.blockNumber ?? 0);
    parsed.push({
      from: lower(from),
      to: row.to ? lower(row.to) : undefined,
      value,
      txHash: hash.toLowerCase(),
      timestamp: Math.floor(timestamp),
      blockNumber: Number.isFinite(blockNumber) ? blockNumber : 0,
    });
  }
  return parsed;
}

function scoutAddress(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const hash = (value as { hash?: unknown }).hash;
  return typeof hash === "string" ? hash : null;
}

export function parseScoutV2Items(items: readonly Record<string, unknown>[], recipient?: string): InboundNative[] {
  const rows: ScoutTx[] = [];
  for (const item of items) {
    const from = scoutAddress(item.from);
    const to = scoutAddress(item.to);
    const hash = typeof item.hash === "string" ? item.hash : typeof item.transaction_hash === "string" ? item.transaction_hash : undefined;
    const value = typeof item.value === "string" ? item.value : undefined;
    const timestamp = typeof item.timestamp === "string" ? item.timestamp : undefined;
    const blockNumber =
      typeof item.block_number === "number"
        ? String(item.block_number)
        : typeof item.block === "number"
          ? String(item.block)
          : undefined;
    if (!from || !to || !hash || !value) continue;
    rows.push({ from, to, hash, value, timestamp, blockNumber });
  }
  return parseScoutTxs(rows, recipient);
}

async function alchemyInbound(httpUrl: string, deployer: string, toBlock: bigint): Promise<InboundNative[]> {
  const response = await fetch(httpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [alchemyFunderQuery(deployer, toBlock)],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`alchemy_getAssetTransfers ${response.status}`);
  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: { transfers?: AlchemyTransfer[] };
  };
  if (payload.error) throw new Error(payload.error.message ?? "alchemy_getAssetTransfers failed");
  return parseAlchemyTransfers(payload.result?.transfers ?? []);
}

async function scoutV1Page(origin: string, action: "txlist" | "txlistinternal", deployer: string, toBlock: bigint, page: number): Promise<ScoutTx[]> {
  const url = new URL("/api", origin);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", action);
  url.searchParams.set("address", deployer);
  url.searchParams.set("startblock", "0");
  url.searchParams.set("endblock", toBlock.toString());
  url.searchParams.set("page", String(page));
  url.searchParams.set("offset", "100");
  url.searchParams.set("sort", "asc");
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`blockscout ${response.status}`);
  const payload = (await response.json()) as { status?: string; message?: string; result?: unknown };
  if (payload.message === "No transactions found") return [];
  if (!Array.isArray(payload.result)) {
    const detail = typeof payload.result === "string" ? payload.result : (payload.message ?? "unexpected result");
    throw new Error(`blockscout ${action} ${detail}`);
  }
  return payload.result as ScoutTx[];
}

async function earliestScoutV1(origin: string, action: "txlist" | "txlistinternal", deployer: string, toBlock: bigint): Promise<InboundNative | null> {
  const rows: InboundNative[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const raw = await scoutV1Page(origin, action, deployer, toBlock, page);
    if (raw.length === 0) return pickFunder(rows, deployer);
    const batch = parseScoutTxs(raw, deployer).filter((row) => withinFunderBlock(row, toBlock));
    rows.push(...batch);
    if (pickFunder(batch, deployer) || raw.length < 100) return pickFunder(rows, deployer);
  }
  throw new Error(`blockscout ${action} truncated before the earliest inbound transfer`);
}

async function blockscoutV2(origin: string, deployer: string, toBlock: bigint): Promise<InboundNative[]> {
  const rows: InboundNative[] = [];
  for (const kind of ["transactions", "internal-transactions"] as const) {
    let next: string | null = `${origin}/api/v2/addresses/${deployer}/${kind}`;
    for (let page = 0; page < 40; page += 1) {
      if (!next) break;
      const response = await fetch(next, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`blockscout ${response.status}`);
      const payload = (await response.json()) as {
        items?: Record<string, unknown>[];
        next_page_params?: Record<string, unknown> | null;
      };
      const batch = parseScoutV2Items(payload.items ?? [], deployer).filter((row) => withinFunderBlock(row, toBlock));
      rows.push(...batch);
      const params = payload.next_page_params;
      if (!params) {
        next = null;
        break;
      }
      if (page === 39) throw new Error(`blockscout ${kind} truncated before the earliest inbound transfer`);
      const nextUrl = new URL(next);
      for (const [key, value] of Object.entries(params)) nextUrl.searchParams.set(key, String(value));
      next = nextUrl.toString();
    }
  }
  return rows;
}

function truncatedHistory(error: unknown): boolean {
  return error instanceof Error && error.message.includes("truncated");
}

async function blockscoutInbound(origin: string, deployer: string, toBlock: bigint): Promise<InboundNative[]> {
  try {
    const [external, internal] = await Promise.all([
      earliestScoutV1(origin, "txlist", deployer, toBlock),
      earliestScoutV1(origin, "txlistinternal", deployer, toBlock),
    ]);
    return [external, internal].filter((row): row is InboundNative => row != null);
  } catch (error) {
    if (truncatedHistory(error)) throw error;
    console.error("[funder] blockscout v1", error instanceof Error ? error.message : error);
  }
  return blockscoutV2(origin, deployer, toBlock);
}

/**
 * Alchemy's earliest inbound native transfer, then Blockscout if that call is empty or unusable.
 * Throws when both sources fail so the caller can retry on the next cron.
 */
export async function resolveFunder(args: {
  httpUrl: string;
  blockscoutOrigin: string;
  deployer: string;
  toBlock: bigint;
}): Promise<InboundNative | null> {
  let alchemyFailed = false;
  try {
    const picked = pickFunder(await alchemyInbound(args.httpUrl, args.deployer, args.toBlock), args.deployer);
    if (picked) return picked;
  } catch (error) {
    alchemyFailed = true;
    console.error("[funder] alchemy", error instanceof Error ? error.message : error);
  }
  try {
    return pickFunder(await blockscoutInbound(args.blockscoutOrigin, args.deployer, args.toBlock), args.deployer);
  } catch (error) {
    if (alchemyFailed) throw error;
    throw error;
  }
}
