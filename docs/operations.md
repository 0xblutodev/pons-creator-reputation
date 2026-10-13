# Operations

- First run: copy `.env.example` to `.env`, run `npm install`, run `npm run index`, then `npm start`.
- After `npm start`, the dashboard is at `http://localhost:8789` unless `PORT` is set.
- Run `npm run index` from cron or a process manager; each run picks up from the stored cursor.
- The HTTP server and the indexer run as separate processes and share only the SQLite file.
- `npm run dev` restarts the server on file changes.
- `npm run typecheck` runs `tsc --noEmit` without writing output.
- `npm test` runs `test/*.test.ts` with the Node test runner and `tsx`.
- Index state lives in `data/reputation.sqlite`, which is git-ignored.
- Copy the SQLite file together with any `-wal` file when taking a backup while the server is running.
- Deleting the database file makes the next `npm run index` rebuild from `FROM_BLOCK` or the 30-day lookback.
- Missing quotes and truncated explorer history are retried automatically on the next cron run.
- Point a process monitor at `/health` to check that the server is up.
