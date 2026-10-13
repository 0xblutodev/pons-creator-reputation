# Configuration

- `ALCHEMY_HTTP_URL` must point at a Robinhood Chain Alchemy HTTP endpoint; the indexer does not fall back to a public RPC.
- `DB_PATH` defaults to `data/reputation.sqlite`; a blank value falls back to the default.
- `PORT` defaults to 8789 and is clamped to at least 1.
- `LOG_CHUNK_BLOCKS` defaults to 2000 and is clamped to at least 100 blocks per `eth_getLogs` span.
- `LOOKBACK_DAYS` defaults to 30 and is clamped to at least 1 day; it is converted to seconds when the config loads.
- `CLUSTER_WINDOW_DAYS` defaults to 7 and is clamped to at least 1 day.
- `BLOCKSCOUT_ORIGIN` defaults to `https://robinhoodchain.blockscout.com`; a trailing slash is stripped.
- `FROM_BLOCK` sets the first block to scan, but only when the database has no stored cursor.
- A `FROM_BLOCK` that is not an integer fails startup with `FROM_BLOCK must be an integer block number`.
- Numeric settings that do not parse fail with `<NAME> must be a number` instead of silently using a default.
- Empty or whitespace-only numeric values fall back to their defaults.
- `LOOKBACK_DAYS`, `CLUSTER_WINDOW_DAYS`, `PORT`, and `LOG_CHUNK_BLOCKS` are floored to whole numbers before the clamp is applied.
- `.env`, `data/`, and the SQLite journal, WAL, and SHM files are git-ignored so credentials and index state stay local.
- Node 22.13 or newer is required; the scripts pass `--experimental-sqlite` to enable the built-in SQLite module.
- `.env.example` lists every supported variable; copy it to `.env` before the first run.
