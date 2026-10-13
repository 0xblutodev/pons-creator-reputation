# Survival rules

- Each graduated launch is judged over a 24-hour and a 7-day window.
- Liquidity stayed when the pair still exists and USD liquidity is at least half of the first post-graduation reading.
- The creator dumped when their token balance fell by 10% or more from the graduation snapshot.
- A creator who already exited counts as having dumped.
- A window survives only when liquidity stayed and the creator did not dump.
- A missing DexScreener quote is retried on the next cron instead of closing the window.
- A window is written only after it has fully elapsed since graduation.
- The baseline snapshot has to predate the end of the window, otherwise a later check would compare a quote to itself.
- The 24-hour window can close while the 7-day window is still running.
- A zero or negative snapshot balance is never treated as a dump.
