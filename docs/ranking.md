# Leaderboard ranking

- Creators rank by 7-day survival rate, then 24-hour survival rate, then graduation rate.
- Creators with fewer than 3 judged 7-day launches stay off the leaderboard.
- Launch count, median time to sell, and cluster size are columns only and never sort keys.
- Equal creators are ordered by deployer address so the board is stable between requests.
- When 7-day survival ties, a creator with no judged 24-hour launches sorts after one that has a rate.
