# Configuration

- `ALCHEMY_HTTP_URL` must point at a Robinhood Chain Alchemy HTTP endpoint; the indexer does not fall back to a public RPC.
- `DB_PATH` defaults to `data/reputation.sqlite`; a blank value falls back to the default.
- `PORT` defaults to 8789 and is clamped to at least 1.
- `LOG_CHUNK_BLOCKS` defaults to 2000 and is clamped to at least 100 blocks per `eth_getLogs` span.
- `LOOKBACK_DAYS` defaults to 30 and is clamped to at least 1 day; it is converted to seconds when the config loads.
