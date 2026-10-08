import {
  baselineCovers,
  creatorDumped,
  DAY_SECONDS,
  liquidityStayed,
  WEEK_SECONDS,
  windowSurvived,
} from "./survival.js";

export type SurvivalWindow = "24h" | "7d";

export type WindowJudgement = {
  window: SurvivalWindow;
  liquidityStayed: boolean;
  creatorDumped: boolean;
  survived: boolean;
};

export type JudgeInput = {
  now: number;
  graduatedAt: number;
  snapshotAt: number | null;
  baselineLiquidity: number | null;
  currentLiquidity: number | null;
  snapshotBalance: bigint | null;
  currentBalance: bigint | null;
  creatorExited: boolean;
  done24h: boolean;
  done7d: boolean;
};

/**
 * A missing DexScreener quote is left open so the next cron can retry it.
 * A window is written only after it has elapsed and the snapshot predates it.
 */
export function decideSurvival(input: JudgeInput): WindowJudgement[] {
  const specs: Array<[SurvivalWindow, number, boolean]> = [
    ["24h", DAY_SECONDS, input.done24h],
    ["7d", WEEK_SECONDS, input.done7d],
  ];
  const judged: WindowJudgement[] = [];
  for (const [window, seconds, done] of specs) {
    if (done) continue;
    if (input.graduatedAt <= 0 || input.graduatedAt + seconds > input.now) continue;
    if (!baselineCovers(input.snapshotAt, input.graduatedAt, seconds)) continue;
    if (input.currentLiquidity == null || input.baselineLiquidity == null) continue;
    if (input.currentBalance == null && !input.creatorExited) continue;
    const stayed = liquidityStayed(input.currentLiquidity, input.baselineLiquidity);
    const dumped =
      input.creatorExited ||
      (input.snapshotBalance != null &&
        input.currentBalance != null &&
        creatorDumped(input.currentBalance, input.snapshotBalance));
    judged.push({
      window,
      liquidityStayed: stayed,
      creatorDumped: dumped,
      survived: windowSurvived(stayed, dumped),
    });
  }
  return judged;
}
