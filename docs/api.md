# HTTP API

- `GET /api/wallets/:address` accepts a deployer, a funder, or an address that is both.
- An address with no indexed rows returns an empty result and does not trigger a live chain scan.
