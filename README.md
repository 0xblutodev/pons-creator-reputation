# Creator reputation

Read-only lookup for Pons V2 creators on Robinhood Chain (chain id `4663`) and the wallet that first funded them. It does not submit launches or transfers.

The page talks to this process. It does not embed an RPC key. Flap `TokenCreated` is a different venue and is not indexed.

## Run

Node 22.13 or newer.

```bash
cp .env.example .env
npm install
npm run index
npm start
```

Open `http://localhost:8789`. Set `ALCHEMY_HTTP_URL` to a Robinhood Chain Alchemy HTTP endpoint. The indexer does not fall back to a public RPC. `npm run index` is the one-shot cron: each run continues from the stored cursor. The default lookback is 30 days; `FROM_BLOCK` overrides that start when the database has no cursor. The database is `data/reputation.sqlite`.

`CLUSTER_WINDOW_DAYS` is the trailing window for a funder's cluster (default 7). `LOG_CHUNK_BLOCKS` is the `eth_getLogs` span (default 2000).

## What it stores

Pons factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`:

- `TokenLaunched` opens the row. The indexed deployer is the creator.
- The funder is that deployer's earliest inbound native ETH at or before their first indexed launch. The result is cached, including an empty result, so later launches do not call Alchemy again. If Alchemy returns nothing usable, Blockscout address transactions and internal transactions are tried.
- `PoolGraduated` marks graduation.
- Sell speed is the seconds from the launch timestamp to the first `CurveSell` by the deployer, or the first token `Transfer` from the deployer into the graduated pool. No exit after 7 days is stored as held.
- After graduation the cron snapshots DexScreener liquidity and the creator's token balance, then judges at 24 hours and 7 days. Liquidity stayed when the pair still exists and USD liquidity is at least half of that first reading. The creator dumped when their balance fell by 10% or more, or they already exited. A window survives only when liquidity stayed and the creator did not dump. A missing quote is retried instead of closing the window.

A funder's cluster size is the count of distinct deployers they seeded whose first indexed launch is inside the trailing window. The wallet page still lists older deployers.

The leaderboard ranks creators with at least 3 judged 7-day launches by 7-day survival rate, then 24-hour survival rate, then graduation rate. Median time-to-sell and cluster size are columns only.

## API

- `GET /api/wallets/:address` accepts a deployer, a funder, or both. An unknown address is an empty indexed result. It does not scan the chain live.
- `GET /api/leaderboard?limit=`

`GET /health` returns `{ "ok": true }`.
