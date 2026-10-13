# Funder lookup

- The funder is the deployer's earliest inbound native ETH at or before their first indexed launch.
- The funder result is cached, including an empty result, so later launches do not call Alchemy again.
- If Alchemy returns nothing usable, Blockscout address transactions and internal transactions are tried.
- A truncated explorer history is left unresolved and retried on the next cron.
- A creator whose funder is unresolved is reported with a null funder.
- An earlier outbound transfer does not beat a later inbound one when picking the funder.
