export const MIN_JUDGED_7D = 3;

export type CreatorStats = {
  deployer: string;
  funder: string | null;
  launches: number;
  graduated: number;
  judged24h: number;
  survived24h: number;
  judged7d: number;
  survived7d: number;
  sellSeconds: number[];
  clusterSize: number;
};

export type RankedCreator = {
  deployer: string;
  funder: string | null;
  launches: number;
  graduated: number;
  graduationRate: number;
  survival24h: number | null;
  survival7d: number;
  judged7d: number;
  medianSellSeconds: number | null;
  clusterSize: number;
};

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const right = sorted[mid];
  if (right == null) return null;
  if (sorted.length % 2 === 1) return right;
  const left = sorted[mid - 1];
  if (left == null) return right;
  return (left + right) / 2;
}

export function graduationRate(graduated: number, launches: number): number {
  if (launches <= 0) return 0;
  return graduated / launches;
}

export function survivalRate(survived: number, judged: number): number | null {
  if (judged <= 0) return null;
  return survived / judged;
}

function compareNullableDesc(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

/**
 * Rank by 7-day survival, then 24-hour survival, then graduation rate.
 * Launch count, sell speed, and cluster size are not sort keys.
 * Creators with fewer than 3 judged 7-day launches stay off the board.
 */
export function rankCreators(rows: readonly CreatorStats[], minJudged7d = MIN_JUDGED_7D): RankedCreator[] {
  const ranked: RankedCreator[] = [];
  for (const row of rows) {
    if (row.judged7d < minJudged7d) continue;
    ranked.push({
      deployer: row.deployer,
      funder: row.funder,
      launches: row.launches,
      graduated: row.graduated,
      graduationRate: graduationRate(row.graduated, row.launches),
      survival24h: survivalRate(row.survived24h, row.judged24h),
      survival7d: survivalRate(row.survived7d, row.judged7d) ?? 0,
      judged7d: row.judged7d,
      medianSellSeconds: median(row.sellSeconds),
      clusterSize: row.clusterSize,
    });
  }
  ranked.sort((left, right) => {
    if (left.survival7d !== right.survival7d) return right.survival7d - left.survival7d;
    const day = compareNullableDesc(left.survival24h, right.survival24h);
    if (day !== 0) return day;
    if (left.graduationRate !== right.graduationRate) return right.graduationRate - left.graduationRate;
    return left.deployer.localeCompare(right.deployer);
  });
  return ranked;
}
