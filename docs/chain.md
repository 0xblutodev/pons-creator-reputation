# Chain and venue

- Robinhood Chain uses chain id 4663.
- The Pons V2 factory is `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e`.
- The chain definition uses Ether with 18 decimals as the native currency.
- The chain definition points its default block explorer at Blockscout.
- `tokenUrl` builds `https://robinhoodchain.blockscout.com/token/<address>`.
- `addressUrl` builds `https://robinhoodchain.blockscout.com/address/<address>`.
- Address helpers lowercase values before comparing them.
- `isZeroAddress` treats mixed-case zero addresses as zero.
- `sameAddress` compares addresses case-insensitively.
- Flap launches share the chain but are a different venue and are not read.
- The chain client is built from a single HTTP URL supplied through `ALCHEMY_HTTP_URL`.
- DexScreener pairs are kept only when their chain id contains `robin` or equals `4663`.
