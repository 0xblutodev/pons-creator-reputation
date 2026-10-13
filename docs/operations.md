# Operations

- First run: copy `.env.example` to `.env`, run `npm install`, run `npm run index`, then `npm start`.
- After `npm start`, the dashboard is at `http://localhost:8789` unless `PORT` is set.
- Run `npm run index` from cron or a process manager; each run picks up from the stored cursor.
- The HTTP server and the indexer run as separate processes and share only the SQLite file.
