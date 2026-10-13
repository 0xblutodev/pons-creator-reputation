# Funder lookup

- The funder is the deployer's earliest inbound native ETH at or before their first indexed launch.
- The funder result is cached, including an empty result, so later launches do not call Alchemy again.
- If Alchemy returns nothing usable, Blockscout address transactions and internal transactions are tried.
- A truncated explorer history is left unresolved and retried on the next cron.
- A creator whose funder is unresolved is reported with a null funder.
- An earlier outbound transfer does not beat a later inbound one when picking the funder.
- Transfers from the deployer to itself are ignored when picking the funder.
- The Alchemy funder query asks for the earliest single inbound native transfer.
- Only transfers at or before the first indexed launch block are eligible as the funder.
- A funder's cluster size is the number of distinct deployers they seeded whose first indexed launch falls inside the trailing window.
- The cluster window defaults to 7 days and is set with `CLUSTER_WINDOW_DAYS`.
- The wallet page still lists older deployers that fall outside the cluster window.
