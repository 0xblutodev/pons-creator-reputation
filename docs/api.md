# HTTP API

- `GET /api/wallets/:address` accepts a deployer, a funder, or an address that is both.
- An address with no indexed rows returns an empty result and does not trigger a live chain scan.
- An invalid address returns HTTP 400 with `{ "error": "invalid address" }`.
- `GET /api/leaderboard?limit=` returns ranked creators under a `creators` key.
- `limit` defaults to 50 and is clamped between 1 and 200.
- A `limit` that is not a number falls back to the default of 50.
- `GET /health` returns `{ "ok": true }` for liveness probes.
- `GET /` serves `web/index.html`.
- The page talks to this process and does not embed an RPC key.
- Addresses are validated with viem's `isAddress`.
- `createApp` accepts a `now` function so tests can pin the clock.
