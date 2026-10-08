export const CLUSTER_WINDOW_DAYS = 7;

export type SeededDeployer = {
  deployer: string;
  firstLaunchAt: number;
};

/** Distinct deployers whose first indexed launch falls inside the trailing window. */
export function clusterSize(deployers: readonly SeededDeployer[], now: number, windowDays = CLUSTER_WINDOW_DAYS): number {
  const cutoff = now - windowDays * 86_400;
  const recent = new Set<string>();
  for (const row of deployers) {
    if (row.firstLaunchAt >= cutoff) recent.add(row.deployer.toLowerCase());
  }
  return recent.size;
}

export function inClusterWindow(firstLaunchAt: number, now: number, windowDays = CLUSTER_WINDOW_DAYS): boolean {
  return firstLaunchAt >= now - windowDays * 86_400;
}
