export type Config = {
  alchemyHttp: string;
  fromBlock: bigint | null;
  dbPath: string;
  port: number;
  logChunkBlocks: number;
  lookbackSeconds: number;
  clusterWindowDays: number;
  blockscoutOrigin: string;
};

function numeric(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const alchemyHttp = (env.ALCHEMY_HTTP_URL ?? "").trim();
  const fromRaw = (env.FROM_BLOCK ?? "").trim();
  let fromBlock: bigint | null = null;
  if (fromRaw) {
    try {
      fromBlock = BigInt(fromRaw);
    } catch {
      throw new Error("FROM_BLOCK must be an integer block number");
    }
  }

  const lookbackDays = Math.max(1, Math.floor(numeric(env, "LOOKBACK_DAYS", 30)));
  const origin = (env.BLOCKSCOUT_ORIGIN ?? "https://robinhoodchain.blockscout.com").trim();

  return {
    alchemyHttp,
    fromBlock,
    dbPath: (env.DB_PATH ?? "data/reputation.sqlite").trim() || "data/reputation.sqlite",
    port: Math.max(1, Math.floor(numeric(env, "PORT", 8789))),
    logChunkBlocks: Math.max(100, Math.floor(numeric(env, "LOG_CHUNK_BLOCKS", 2000))),
    lookbackSeconds: lookbackDays * 86_400,
    clusterWindowDays: Math.max(1, Math.floor(numeric(env, "CLUSTER_WINDOW_DAYS", 7))),
    blockscoutOrigin: origin.replace(/\/$/, ""),
  };
}
