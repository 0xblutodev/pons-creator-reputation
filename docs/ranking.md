# Leaderboard ranking

- Creators rank by 7-day survival rate, then 24-hour survival rate, then graduation rate.
- Creators with fewer than 3 judged 7-day launches stay off the leaderboard.
- Launch count, median time to sell, and cluster size are columns only and never sort keys.
- Equal creators are ordered by deployer address so the board is stable between requests.
- When 7-day survival ties, a creator with no judged 24-hour launches sorts after one that has a rate.
- Graduation rate is graduated launches divided by total launches, and 0 when there are no launches.
- Survival rate is survived windows divided by judged windows, and null when none are judged.
- Median time to sell uses sold launches only, and averages the two middle values for an even count.
- The median is null when no launch has a recorded sell.
- The 3-launch minimum is exported as `MIN_JUDGED_7D` and can be overridden per call.
- A higher 7-day survival rate ranks first even when the creator has fewer launches.
- Each leaderboard row carries the deployer, funder, launches, graduated count, rates, judged count, median sell seconds, and cluster size.
