# Indexer

- The indexer reads the Pons V2 factory `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` on Robinhood Chain (chain id 4663).
- `TokenLaunched` opens a launch row, and the indexed deployer topic is the creator.
- `PoolGraduated` marks a launch as graduated.
- `npm run index` is a one-shot run; each run continues from the stored cursor.
- With no cursor and no `FROM_BLOCK`, the first run starts 30 days back by default.
