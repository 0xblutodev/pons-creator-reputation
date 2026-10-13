# Testing

- Tests use the built-in Node test runner with `tsx`; `--experimental-sqlite` is required for the store.
- `test/survival.test.ts` covers the half-liquidity rule, the 10% sale threshold, and baseline coverage.
- `test/judge.test.ts` checks that a missing quote stays open and that 24h can close before 7d.
- A snapshot taken after the window is covered by a judge test and cannot close it.
- `test/rank.test.ts` covers 7-day ordering, the 3-launch minimum, and the sold-only median.
- `test/store.test.ts` exercises clustering, leaderboard order, and held launches against SQLite.
- `test/funder.test.ts` covers earliest-transfer selection and the Alchemy query shape.
- `test/decode.test.ts` round-trips `TokenLaunched` and checks that the third indexed topic is the deployer.
- `test/api.test.ts` checks that wallet search and the leaderboard read from the index.
- `test/dashboard.test.ts` renders the page with jsdom and checks the token table and cluster line.
- jsdom is a dev dependency used only by the dashboard test.
- Run a single file with `node --experimental-sqlite --import tsx --test test/rank.test.ts`.
- Run `npm run typecheck` alongside `npm test` before merging.
