# Testing

- Tests use the built-in Node test runner with `tsx`; `--experimental-sqlite` is required for the store.
- `test/survival.test.ts` covers the half-liquidity rule, the 10% sale threshold, and baseline coverage.
- `test/judge.test.ts` checks that a missing quote stays open and that 24h can close before 7d.
