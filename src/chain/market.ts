export type PoolQuote = {
  pairAddress: string | null;
  liquidityUsd: number | null;
};

type DexPair = {
  chainId?: string;
  pairAddress?: string;
  liquidity?: { usd?: number | null };
};

function isRobinhoodPair(chainId: string | undefined): boolean {
  if (!chainId) return false;
  const id = chainId.toLowerCase();
  return id.includes("robin") || id === "4663";
}

/** First post-graduation liquidity reading. A missing quote stays missing so the cron can retry it. */
export async function poolQuote(token: string): Promise<PoolQuote | null> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`dexscreener ${response.status}`);
  const payload = (await response.json()) as { pairs?: DexPair[] | null };
  const pairs = (payload.pairs ?? []).filter((pair) => isRobinhoodPair(pair.chainId));
  if (pairs.length === 0) return null;
  pairs.sort((left, right) => (right.liquidity?.usd ?? 0) - (left.liquidity?.usd ?? 0));
  const best = pairs[0];
  if (!best) return null;
  return {
    pairAddress: best.pairAddress ?? null,
    liquidityUsd: best.liquidity?.usd ?? null,
  };
}
