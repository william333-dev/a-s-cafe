# How OVR works (plain English)

This is the source of truth for the in-app page `/how-ovr-works`. The code that implements it is in `lib/rating-engine` (TypeScript reference) and `supabase/migrations/20261103000002_engine.sql` (what the server actually runs). The tests prove both give identical numbers.

## XP

- Every completion earns base XP: **minor 10, standard 20, major 35**, or a **custom** 5–50.
- **Streak bonus:** +1% for each day of that habit's current streak (counted *before* today's tap), up to +30% at 30 days. `xp = round(base × (1 + min(streak, 30) × 0.01))`.
- Habits done several times a day split their XP across the taps. The taps always add up to the full amount.
- **Perfect day** (every daily or weekday habit scheduled today is done): **+25**.
- **Quit trackers:** a clean day earns **20** (it counts as a standard habit) with its own streak bonus. It's awarded just after midnight.
- **Daily cap: 500 XP** per calendar day. Late logs for yesterday count toward yesterday's cap.
- You can log **today and yesterday** only.
- **Undo** (long-press) works on taps you made today. Apart from that, XP never goes down.
- **Badges** give a one-off +50.

## Levels

Going from level L−1 to L takes `round(50 × L^1.6)` XP. That's 152 to reach level 2, 1,991 to go from 9 to 10, and so on.

## Streak shields

Every 7 days of streak earns a shield (max 2 per habit). If you miss a scheduled day, a shield is used automatically and the streak survives. Research on habit formation found that a single missed day doesn't derail a habit. Quitting after it does.

## Attributes

There are six: **Body, Mind, Focus, Discipline, Social, Craft.** Each habit belongs to one.

For each habit, we look at every scheduled day in the **last 28 days**:

- **completion** `c` = count ÷ daily target (max 1). Today only counts once it's done.
- **recency weight** `w = 0.5 ^ (days ago ÷ 10)`. Ten days ago counts half as much as today.
- **size weight** `b` = the habit's base XP.

For each attribute `k`:

| Symbol | Formula | Meaning |
|---|---|---|
| S_k | Σ w·b·c ÷ Σ w·b | consistency, 0–1 |
| weeklyXP_k | Σ base XP × scheduled days per week | how much you've signed up for |
| V_k | min(1, weeklyXP_k ÷ 300) | volume, 0–1 |
| ceil_k | 70 + 29 × V_k | one easy habit can't reach 99 |
| A_k | 40 + (ceil_k − 40) × S_k | the attribute score |

- **X-times-a-week** habits have that many slots each week. Unfilled slots only count as misses once the week is over.
- **Quit trackers** feed **Discipline** as a daily 20-XP habit. A slip day counts as a 0.
- A habit only counts once it has had its first scheduled day, so adding a habit never drops your OVR on the spot.

## Overall

- P_k = weeklyXP_k ÷ Σ weeklyXP (attributes you invest more in count more)
- breadth bonus = min(3, max(0, active attributes − 2))
- OVR_calc = clamp(Σ A_k × P_k + breadth, 40, 99)

**Calibration.** Your setup-quiz ratings (1–10) map to a starting estimate B between 45 and 65. Over your first 14 days your habits take over:

- α = min(days since start ÷ 14, 1)
- OVR = (1 − α) × B + α × OVR_calc

**No wild swings.** OVR moves at most **±3 per day**. It's rounded to a whole number and kept between 40 and 99.

## Ranks

There are 9 tiers. Each tier has three divisions (I → II → III), except Apex, which is a single top rank. That's 25 ranks in total. The number is the OVR you need to reach that rank.

| Tier | I | II | III |
|---|---|---|---|
| Rookie | 40 | 44 | 47 |
| Bronze | 50 | 53 | 56 |
| Silver | 60 | 63 | 66 |
| Gold | 70 | 72 | 74 |
| Platinum | 76 | 78 | 80 |
| Diamond | 82 | 84 | 86 |
| Master | 88 | 89 | 90 |
| Legend | 91 | 92 | 93 |
| Apex | 95 | | |

- **New tier** (for example Bronze III → Silver I): full card-flip celebration.
- **New division** (for example Bronze I → Bronze II): a toast.
- **Rank Ladder page:** shows, for every rank, the share of your league whose *best-ever* OVR has reached it.

## "Why it moved"

Each day the server stores the top three attribute changes, with how many of that attribute's scheduled reps you did in the last 7 days. For example: "+2 Focus: 4/4 done this week". It also tells you when calibration or the ±3 cap was the reason.

## League

- **Weekly standings** rank by **completion rate** (done ÷ scheduled this week, with today counting once done). **XP that week** breaks ties. This is computed on the server from your completions, so it can't be faked. Adding 20 easy habits doesn't win; finishing what you scheduled does.
- **All-time board:** by OVR, with total XP as the tiebreak.
- **Seasons:** every 6 weeks. The best average weekly completion rate wins the season and a Champion badge.
- **Duos:** pair up for a week. If your average completion rate is 80% or more, you both get the Dynamic Duo badge.
