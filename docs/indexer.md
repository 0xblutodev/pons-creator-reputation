# Indexer

- The indexer reads the Pons V2 factory `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` on Robinhood Chain (chain id 4663).
- `TokenLaunched` opens a launch row, and the indexed deployer topic is the creator.
- `PoolGraduated` marks a launch as graduated.
- `npm run index` is a one-shot run; each run continues from the stored cursor.
- With no cursor and no `FROM_BLOCK`, the first run starts 30 days back by default.
- A log range rejected as too wide is split in half and retried until a single block fails.
- Log queries walk the block range in `LOG_CHUNK_BLOCKS` slices (default 2000).
- Flap `TokenCreated` is a different venue and is not indexed.
- The service is read-only: it never submits launches or transfers.
- Sell speed is the time from the launch timestamp to the creator's first `CurveSell`, or to the first token transfer from the deployer into the graduated pool.
- A creator with no exit after 7 days is stored as held, and an earlier exit replaces that mark.
- After graduation the cron snapshots DexScreener liquidity and the creator's token balance.
