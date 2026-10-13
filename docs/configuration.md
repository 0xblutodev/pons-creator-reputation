# Configuration

- `ALCHEMY_HTTP_URL` must point at a Robinhood Chain Alchemy HTTP endpoint; the indexer does not fall back to a public RPC.
- `DB_PATH` defaults to `data/reputation.sqlite`; a blank value falls back to the default.
- `PORT` defaults to 8789 and is clamped to at least 1.
