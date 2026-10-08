import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { lower } from "./addresses.js";
import { clusterSize, inClusterWindow } from "./cluster.js";
import { rankCreators, type RankedCreator } from "./rank.js";
import { WEEK_SECONDS } from "./survival.js";

export type NewLaunch = {
  token: string;
  curve: string;
  deployer: string;
  pairToken: string | null;
  launchConfigId: string | null;
  graduationThreshold: string | null;
  name: string | null;
  symbol: string | null;
  launchBlock: number;
  launchTx: string;
  launchedAt: number;
};

export type FunderInput = {
  deployer: string;
  funder: string | null;
  amount: string | null;
  tx: string | null;
  timestamp: number | null;
};

export type CheckpointInput = {
  token: string;
  window: "24h" | "7d";
  checkedAt: number;
  liquidityUsd: number | null;
  creatorBalance: string | null;
  liquidityStayed: boolean;
  creatorDumped: boolean;
  survived: boolean;
};

export type LaunchRecord = {
  token: string;
  curve: string;
  deployer: string;
  pairToken: string | null;
  name: string | null;
  symbol: string | null;
  launchBlock: number;
  launchTx: string;
  launchedAt: number;
  graduated: boolean;
  graduationBlock: number | null;
  graduatedAt: number | null;
  pool: string | null;
  poolScanned: boolean;
  sellStatus: "open" | "sold" | "held";
  sellSeconds: number | null;
  sellBlock: number | null;
  sellTx: string | null;
  gradLiquidityUsd: number | null;
  gradCreatorBalance: string | null;
  gradSnapshotAt: number | null;
};

export type WindowView = {
  survived: boolean;
  liquidityStayed: boolean;
  creatorDumped: boolean;
};

export type TokenView = {
  token: string;
  curve: string;
  deployer: string;
  name: string | null;
  symbol: string | null;
  launchBlock: number;
  launchedAt: number;
  graduated: boolean;
  graduatedAt: number | null;
  sell: { status: "open" | "sold" | "held"; seconds: number | null };
  survival: { "24h": WindowView | null; "7d": WindowView | null };
};

export type WalletView = {
  address: string;
  deployer: null | {
    funder: null | { address: string; amount: string; tx: string; timestamp: number };
    clusterSize: number | null;
    tokens: TokenView[];
  };
  funder: null | {
    clusterSize: number;
    deployers: { address: string; firstLaunchAt: number; inCluster: boolean; tokens: TokenView[] }[];
  };
};

type LaunchRow = {
  token: string;
  curve: string;
  deployer: string;
  pair_token: string | null;
  launch_config_id: string | null;
  graduation_threshold: string | null;
  name: string | null;
  symbol: string | null;
  launch_block: number;
  launch_tx: string;
  launched_at: number;
  graduated: number;
  graduation_block: number | null;
  graduated_at: number | null;
  pool: string | null;
  pool_scanned: number;
  sell_status: string;
  sell_seconds: number | null;
  sell_block: number | null;
  sell_tx: string | null;
  grad_liquidity_usd: number | null;
  grad_creator_balance: string | null;
  grad_snapshot_at: number | null;
  updated_at: number;
};

type CheckpointRow = {
  token: string;
  window: string;
  checked_at: number;
  liquidity_usd: number | null;
  creator_balance: string | null;
  liquidity_stayed: number;
  creator_dumped: number;
  survived: number;
};

type FunderRow = {
  deployer: string;
  funder: string | null;
  amount: string | null;
  tx: string | null;
  timestamp: number | null;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launches (
  token TEXT PRIMARY KEY,
  curve TEXT NOT NULL,
  deployer TEXT NOT NULL,
  pair_token TEXT,
  launch_config_id TEXT,
  graduation_threshold TEXT,
  name TEXT,
  symbol TEXT,
  launch_block INTEGER NOT NULL,
  launch_tx TEXT NOT NULL,
  launched_at INTEGER NOT NULL,
  graduated INTEGER NOT NULL DEFAULT 0,
  graduation_block INTEGER,
  graduated_at INTEGER,
  pool TEXT,
  pool_scanned INTEGER NOT NULL DEFAULT 0,
  sell_status TEXT NOT NULL DEFAULT 'open',
  sell_seconds INTEGER,
  sell_block INTEGER,
  sell_tx TEXT,
  grad_liquidity_usd REAL,
  grad_creator_balance TEXT,
  grad_snapshot_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS funders (
  deployer TEXT PRIMARY KEY,
  funder TEXT,
  amount TEXT,
  tx TEXT,
  timestamp INTEGER,
  resolved_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  token TEXT NOT NULL,
  window TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  liquidity_usd REAL,
  creator_balance TEXT,
  liquidity_stayed INTEGER NOT NULL,
  creator_dumped INTEGER NOT NULL,
  survived INTEGER NOT NULL,
  PRIMARY KEY (token, window),
  FOREIGN KEY (token) REFERENCES launches(token)
);

CREATE INDEX IF NOT EXISTS idx_launches_deployer ON launches(deployer, launch_block);
CREATE INDEX IF NOT EXISTS idx_launches_curve ON launches(curve);
CREATE INDEX IF NOT EXISTS idx_funders_funder ON funders(funder);
`;

function sellStatus(value: string): "open" | "sold" | "held" {
  if (value === "sold" || value === "held") return value;
  return "open";
}

function mapLaunch(row: LaunchRow): LaunchRecord {
  return {
    token: row.token,
    curve: row.curve,
    deployer: row.deployer,
    pairToken: row.pair_token,
    name: row.name,
    symbol: row.symbol,
    launchBlock: row.launch_block,
    launchTx: row.launch_tx,
    launchedAt: row.launched_at,
    graduated: row.graduated === 1,
    graduationBlock: row.graduation_block,
    graduatedAt: row.graduated_at,
    pool: row.pool,
    poolScanned: row.pool_scanned === 1,
    sellStatus: sellStatus(row.sell_status),
    sellSeconds: row.sell_seconds,
    sellBlock: row.sell_block,
    sellTx: row.sell_tx,
    gradLiquidityUsd: row.grad_liquidity_usd,
    gradCreatorBalance: row.grad_creator_balance,
    gradSnapshotAt: row.grad_snapshot_at,
  };
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    }
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    if (filename !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  getCursor(): number | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'cursor'").get() as { value: string } | undefined;
    if (!row) return null;
    const block = Number(row.value);
    return Number.isFinite(block) ? block : null;
  }

  setCursor(block: number): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(block));
  }

  insertLaunch(input: NewLaunch, now = Date.now()): boolean {
    const info = this.db
      .prepare(
        `INSERT INTO launches (
          token, curve, deployer, pair_token, launch_config_id, graduation_threshold,
          name, symbol, launch_block, launch_tx, launched_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(token) DO NOTHING`,
      )
      .run(
        lower(input.token),
        lower(input.curve),
        lower(input.deployer),
        input.pairToken ? lower(input.pairToken) : null,
        input.launchConfigId,
        input.graduationThreshold,
        input.name,
        input.symbol,
        input.launchBlock,
        input.launchTx.toLowerCase(),
        input.launchedAt,
        now,
      );
    return Number(info.changes) === 1;
  }

  updateMeta(token: string, patch: { name: string | null; symbol: string | null }): void {
    this.db
      .prepare("UPDATE launches SET name = COALESCE(name, ?), symbol = COALESCE(symbol, ?), updated_at = ? WHERE token = ?")
      .run(patch.name, patch.symbol, Date.now(), lower(token));
  }

  noteGraduated(token: string, block: number, at: number): void {
    this.db
      .prepare(
        `UPDATE launches SET
          graduated = 1,
          graduation_block = COALESCE(graduation_block, ?),
          graduated_at = CASE WHEN graduated_at IS NULL OR graduated_at = 0 THEN ? ELSE graduated_at END,
          updated_at = ?
        WHERE token = ?`,
      )
      .run(block, at, Date.now(), lower(token));
  }

  setPool(token: string, pool: string): void {
    this.db.prepare("UPDATE launches SET pool = COALESCE(pool, ?), updated_at = ? WHERE token = ?").run(lower(pool), Date.now(), lower(token));
  }

  saveSnapshot(token: string, input: { liquidityUsd: number | null; creatorBalance: string | null; at: number }): void {
    this.db
      .prepare(
        `UPDATE launches SET
          grad_liquidity_usd = COALESCE(grad_liquidity_usd, ?),
          grad_creator_balance = COALESCE(grad_creator_balance, ?),
          grad_snapshot_at = CASE
            WHEN grad_snapshot_at IS NOT NULL AND grad_snapshot_at > 0 THEN grad_snapshot_at
            WHEN ? IS NOT NULL AND ? > 0 THEN ?
            ELSE grad_snapshot_at
          END,
          updated_at = ?
        WHERE token = ?`,
      )
      .run(input.liquidityUsd, input.creatorBalance, input.liquidityUsd, input.at, input.at, Date.now(), lower(token));
  }

  saveCheckpoint(input: CheckpointInput): void {
    this.db
      .prepare(
        `INSERT INTO checkpoints (
          token, window, checked_at, liquidity_usd, creator_balance, liquidity_stayed, creator_dumped, survived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(token, window) DO NOTHING`,
      )
      .run(
        lower(input.token),
        input.window,
        input.checkedAt,
        input.liquidityUsd,
        input.creatorBalance,
        input.liquidityStayed ? 1 : 0,
        input.creatorDumped ? 1 : 0,
        input.survived ? 1 : 0,
      );
  }

  getLaunch(token: string): LaunchRecord | null {
    const row = this.db.prepare("SELECT * FROM launches WHERE token = ?").get(lower(token)) as LaunchRow | undefined;
    return row ? mapLaunch(row) : null;
  }

  listUncachedDeployers(): { deployer: string; firstLaunchBlock: number }[] {
    const rows = this.db
      .prepare(
        `SELECT l.deployer AS deployer, MIN(l.launch_block) AS first_block
         FROM launches l
         LEFT JOIN funders f ON f.deployer = l.deployer
         WHERE f.deployer IS NULL
         GROUP BY l.deployer`,
      )
      .all() as { deployer: string; first_block: number }[];
    return rows.map((row) => ({ deployer: row.deployer, firstLaunchBlock: row.first_block }));
  }

  saveFunder(input: FunderInput): void {
    this.db
      .prepare(
        `INSERT INTO funders (deployer, funder, amount, tx, timestamp, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(deployer) DO UPDATE SET
           funder = excluded.funder,
           amount = excluded.amount,
           tx = excluded.tx,
           timestamp = excluded.timestamp,
           resolved_at = excluded.resolved_at`,
      )
      .run(
        lower(input.deployer),
        input.funder ? lower(input.funder) : null,
        input.amount,
        input.tx ? input.tx.toLowerCase() : null,
        input.timestamp,
        Date.now(),
      );
  }

  listCurveWatch(chunkTo: number, chunkStartTime: number): LaunchRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM launches
         WHERE sell_status != 'sold' AND launch_block <= ? AND launched_at + ? > ?
         ORDER BY launch_block`,
      )
      .all(chunkTo, WEEK_SECONDS, chunkStartTime) as LaunchRow[];
    return rows.map(mapLaunch);
  }

  noteExit(token: string, exit: { block: number; at: number; tx: string }): void {
    const row = this.getLaunch(token);
    if (!row || row.launchedAt <= 0) return;
    if (exit.at < row.launchedAt || exit.at > row.launchedAt + WEEK_SECONDS) return;
    if (row.sellStatus === "sold" && row.sellSeconds != null && row.launchedAt + row.sellSeconds <= exit.at) return;
    this.db
      .prepare(
        `UPDATE launches
         SET sell_status = 'sold', sell_seconds = ?, sell_block = ?, sell_tx = ?, updated_at = ?
         WHERE token = ?`,
      )
      .run(exit.at - row.launchedAt, exit.block, exit.tx.toLowerCase(), Date.now(), row.token);
  }

  listTransferWatch(): LaunchRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM launches
         WHERE graduated = 1 AND pool IS NOT NULL AND pool_scanned = 0 AND launched_at > 0
         ORDER BY launch_block`,
      )
      .all() as LaunchRow[];
    return rows.map(mapLaunch);
  }

  markPoolScanned(token: string): void {
    this.db.prepare("UPDATE launches SET pool_scanned = 1, updated_at = ? WHERE token = ?").run(Date.now(), lower(token));
  }

  markHeldBefore(now: number): number {
    const info = this.db
      .prepare(
        `UPDATE launches
         SET sell_status = 'held', updated_at = ?
         WHERE sell_status = 'open' AND launched_at > 0 AND launched_at + ? <= ?
           AND NOT (graduated = 1 AND pool IS NULL AND launched_at + ? > ?)
           AND NOT (pool IS NOT NULL AND pool_scanned = 0)`,
      )
      .run(Date.now(), WEEK_SECONDS, now, WEEK_SECONDS * 2, now);
    return Number(info.changes);
  }

  listMarketDue(now: number, daySeconds: number, weekSeconds: number): LaunchRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM launches
         WHERE graduated = 1 AND (
           (
             (grad_liquidity_usd IS NULL OR grad_creator_balance IS NULL)
             AND (
               graduated_at IS NULL OR graduated_at <= 0 OR graduated_at + ? > ?
               OR launched_at + ? > ?
             )
           )
           OR (pool IS NULL AND sell_status != 'sold' AND launched_at + ? > ?)
           OR (
             graduated_at > 0 AND graduated_at + ? <= ?
             AND grad_snapshot_at IS NOT NULL AND grad_snapshot_at < graduated_at + ?
             AND NOT EXISTS (
               SELECT 1 FROM checkpoints c WHERE c.token = launches.token AND c.window = '24h'
             )
           )
           OR (
             graduated_at > 0 AND graduated_at + ? <= ?
             AND grad_snapshot_at IS NOT NULL AND grad_snapshot_at < graduated_at + ?
             AND NOT EXISTS (
               SELECT 1 FROM checkpoints c WHERE c.token = launches.token AND c.window = '7d'
             )
           )
         )
         ORDER BY launch_block`,
      )
      .all(
        weekSeconds,
        now,
        weekSeconds,
        now,
        weekSeconds * 2,
        now,
        daySeconds,
        now,
        daySeconds,
        weekSeconds,
        now,
        weekSeconds,
      ) as LaunchRow[];
    return rows.map(mapLaunch);
  }

  checkpointFlags(token: string): { done24h: boolean; done7d: boolean } {
    const rows = this.db.prepare("SELECT window FROM checkpoints WHERE token = ?").all(lower(token)) as { window: string }[];
    const windows = new Set(rows.map((row) => row.window));
    return { done24h: windows.has("24h"), done7d: windows.has("7d") };
  }

  wallet(address: string, now: number, windowDays: number): WalletView {
    const account = lower(address);
    const own = this.launchesFor(account);
    const funderRow = this.db.prepare("SELECT * FROM funders WHERE deployer = ?").get(account) as FunderRow | undefined;
    const seeded = this.seededDeployers(account);
    const funderSection =
      seeded.length === 0
        ? null
        : {
            clusterSize: clusterSize(
              seeded.map((row) => ({ deployer: row.deployer, firstLaunchAt: row.firstAt })),
              now,
              windowDays,
            ),
            deployers: seeded.map((row) => ({
              address: row.deployer,
              firstLaunchAt: row.firstAt,
              inCluster: inClusterWindow(row.firstAt, now, windowDays),
              tokens: this.tokenViews(row.deployer),
            })),
          };

    let deployerSection: WalletView["deployer"] = null;
    if (own.length > 0) {
      const funderAddress = funderRow?.funder ?? null;
      const cluster =
        funderAddress == null
          ? null
          : clusterSize(
              this.seededDeployers(funderAddress).map((row) => ({ deployer: row.deployer, firstLaunchAt: row.firstAt })),
              now,
              windowDays,
            );
      deployerSection = {
        funder:
          funderRow?.funder && funderRow.amount && funderRow.tx && funderRow.timestamp != null
            ? {
                address: funderRow.funder,
                amount: funderRow.amount,
                tx: funderRow.tx,
                timestamp: funderRow.timestamp,
              }
            : null,
        clusterSize: cluster,
        tokens: this.tokenViews(account),
      };
    }

    return { address: account, deployer: deployerSection, funder: funderSection };
  }

  leaderboard(now: number, limit: number, windowDays: number): RankedCreator[] {
    const launches = this.db.prepare("SELECT * FROM launches").all() as LaunchRow[];
    const checkpoints = this.db.prepare("SELECT * FROM checkpoints").all() as CheckpointRow[];
    const funders = this.db.prepare("SELECT deployer, funder FROM funders").all() as { deployer: string; funder: string | null }[];
    const byToken = new Map<string, CheckpointRow[]>();
    for (const row of checkpoints) {
      const list = byToken.get(row.token) ?? [];
      list.push(row);
      byToken.set(row.token, list);
    }
    const funderOf = new Map(funders.map((row) => [row.deployer, row.funder]));
    const firstLaunch = new Map<string, number>();
    for (const row of launches) {
      const prior = firstLaunch.get(row.deployer);
      if (prior == null || row.launched_at < prior) firstLaunch.set(row.deployer, row.launched_at);
    }
    const seededByFunder = new Map<string, { deployer: string; firstLaunchAt: number }[]>();
    for (const [deployer, funder] of funderOf) {
      if (!funder) continue;
      const first = firstLaunch.get(deployer);
      if (first == null) continue;
      const list = seededByFunder.get(funder) ?? [];
      list.push({ deployer, firstLaunchAt: first });
      seededByFunder.set(funder, list);
    }

    const grouped = new Map<
      string,
      {
        launches: number;
        graduated: number;
        judged24h: number;
        survived24h: number;
        judged7d: number;
        survived7d: number;
        sellSeconds: number[];
      }
    >();
    for (const row of launches) {
      const stats = grouped.get(row.deployer) ?? {
        launches: 0,
        graduated: 0,
        judged24h: 0,
        survived24h: 0,
        judged7d: 0,
        survived7d: 0,
        sellSeconds: [],
      };
      stats.launches += 1;
      if (row.graduated === 1) stats.graduated += 1;
      if (row.sell_status === "sold" && row.sell_seconds != null) stats.sellSeconds.push(row.sell_seconds);
      for (const checkpoint of byToken.get(row.token) ?? []) {
        if (checkpoint.window === "24h") {
          stats.judged24h += 1;
          if (checkpoint.survived === 1) stats.survived24h += 1;
        } else if (checkpoint.window === "7d") {
          stats.judged7d += 1;
          if (checkpoint.survived === 1) stats.survived7d += 1;
        }
      }
      grouped.set(row.deployer, stats);
    }

    const creators = [...grouped.entries()].map(([deployer, stats]) => {
      const funder = funderOf.get(deployer) ?? null;
      return {
        deployer,
        funder,
        ...stats,
        clusterSize: funder ? clusterSize(seededByFunder.get(funder) ?? [], now, windowDays) : 0,
      };
    });
    return rankCreators(creators).slice(0, limit);
  }

  private launchesFor(deployer: string): LaunchRow[] {
    return this.db.prepare("SELECT * FROM launches WHERE deployer = ? ORDER BY launch_block DESC").all(deployer) as LaunchRow[];
  }

  private seededDeployers(funder: string): { deployer: string; firstAt: number }[] {
    const rows = this.db
      .prepare(
        `SELECT f.deployer AS deployer, MIN(l.launched_at) AS first_at
         FROM funders f
         JOIN launches l ON l.deployer = f.deployer
         WHERE f.funder = ?
         GROUP BY f.deployer
         ORDER BY first_at DESC`,
      )
      .all(funder) as { deployer: string; first_at: number }[];
    return rows.map((row) => ({ deployer: row.deployer, firstAt: row.first_at }));
  }

  private tokenViews(deployer: string): TokenView[] {
    const rows = this.launchesFor(deployer);
    if (rows.length === 0) return [];
    const checkpoints = this.db
      .prepare(
        `SELECT c.* FROM checkpoints c
         JOIN launches l ON l.token = c.token
         WHERE l.deployer = ?`,
      )
      .all(deployer) as CheckpointRow[];
    const byToken = new Map<string, CheckpointRow[]>();
    for (const row of checkpoints) {
      const list = byToken.get(row.token) ?? [];
      list.push(row);
      byToken.set(row.token, list);
    }
    return rows.map((row) => this.toTokenView(row, byToken.get(row.token) ?? []));
  }

  private toTokenView(row: LaunchRow, checkpoints: readonly CheckpointRow[]): TokenView {
    const windowOf = (name: "24h" | "7d"): WindowView | null => {
      const found = checkpoints.find((item) => item.window === name);
      if (!found) return null;
      return {
        survived: found.survived === 1,
        liquidityStayed: found.liquidity_stayed === 1,
        creatorDumped: found.creator_dumped === 1,
      };
    };
    const launch = mapLaunch(row);
    return {
      token: launch.token,
      curve: launch.curve,
      deployer: launch.deployer,
      name: launch.name,
      symbol: launch.symbol,
      launchBlock: launch.launchBlock,
      launchedAt: launch.launchedAt,
      graduated: launch.graduated,
      graduatedAt: launch.graduatedAt,
      sell: { status: launch.sellStatus, seconds: launch.sellSeconds },
      survival: { "24h": windowOf("24h"), "7d": windowOf("7d") },
    };
  }
}
