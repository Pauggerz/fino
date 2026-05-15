# Insights — Statistical Formulas Reference

This document is the single source of truth for every formula that drives the
**Insights** screen (`src/screens/StatsScreen.tsx`) and the
**Intelligence Engine** (`src/services/IntelligenceEngine.ts`).

Every section follows the same shape:

1. **What it computes** — plain-English statement of the output.
2. **Inputs** — variables and their meaning.
3. **Formula** — the math, with derivation when not obvious.
4. **Why this formula (not a simpler one)** — the statistical justification.
5. **Sufficiency gate** — the minimum sample size before we show the result,
   and the reason we picked that threshold.
6. **Degenerate cases** — what happens when inputs break the formula.

---

## 0. Conventions

- A **transaction** is one row in the `transactions` table with
  `type ∈ {'income', 'expense'}`. **Transfers** (`is_transfer = true` or
  `category = 'transfer'`) and **adjustments** (`category = 'adjustment'`) are
  excluded from every behavioural statistic — they represent money movement,
  not spending behaviour. Transfers are excluded from totals as well;
  adjustments stay in income/expense totals but bow out of category /
  merchant / pattern aggregations.
- `N` denotes a sample size (transaction count).
- `n_d` denotes a day count.
- All currency is in pesos; statistics are unit-agnostic so the choice of
  currency doesn't affect any formula.
- "Current month" means the month the user has picked in the month-picker
  pill, not necessarily today's calendar month.
- ISO date strings are sliced to `YYYY-MM-DD` for day-bucket keys, and to
  `YYYY-MM` for month-bucket keys, so all date math is local-calendar
  consistent regardless of timezone.

---

## 1. Sample-size sufficiency

Every chart and insight chip is gated on a **sufficiency check**. The check
returns `{ ok, current, needed, reason }` and the UI either renders the chart
or renders a "needs more data" overlay with the reason.

### 1.1 Why we gate at all

A mean over 2 transactions is not a mean — it's noise. The same applies to
share-of-spend percentages, "top categories", weekday patterns, and
projections. The Central Limit Theorem only kicks in around `N ≥ 30` for
arbitrary distributions; below that, sample means have wide confidence
intervals and rank orderings flip with single new data points.

The thresholds below are chosen as the smallest `N` at which the statistic
becomes **directionally** informative (not necessarily precise). They're not
arbitrary — each one is tied to a specific failure mode.

### 1.2 Threshold table

| Card / Insight             | Minimum sample                                                | Reason                                                                                              |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cash flow totals           | `≥ 1` income tx **or** `≥ 1` expense tx                        | Single-tx aggregates are valid for display; nothing to estimate.                                    |
| Sankey (income → expense)  | `≥ 1` income tx **and** `≥ 1` expense tx                       | Need both sides to draw the flow.                                                                   |
| Largest expense headline   | `≥ 5` expense txns                                            | Avoids declaring "your largest expense" off one or two charges.                                     |
| Spending trajectory        | `daysElapsed ≥ 7` **and** `txCount ≥ 10`                       | Projection variance scales with `1/√N`. Below 10 txns the 95% CI on the EOM projection exceeds the projection itself. |
| Day-of-week pattern        | `txCount ≥ 14` **and** `populatedWeekdays ≥ 4`                  | Need at least one observation in a majority of buckets for a "peak day" claim to mean anything.     |
| Time-of-day pattern        | `txCount ≥ 15` **and** `populatedBuckets ≥ 2`                   | Same logic as DoW; 4 buckets so threshold scales up slightly.                                       |
| Category donut / share %   | `≥ 10` expense txns **and** `≥ 3` distinct categories          | With <3 categories a donut is a pie of 1–2 slices; with <10 txns rank order is unstable.            |
| Top merchant ("habit")     | `≥ 3` visits to that merchant **within the period**            | Two visits could be coincidence; three is the smallest sample where a pattern claim is defensible. |
| Anomaly vs 3-mo baseline   | Category has spend in `≥ 2` prior months **and** prior-month MAD > 0 | MAD-based z-score is undefined when the baseline has no variation; 2 prior months is the floor.    |
| 6-month trend slope        | `≥ 3` months with non-zero spend                              | OLS slope on `< 3` points is either undefined or perfectly determined (R² = 1, meaningless).        |
| Recurring bill detection   | `≥ 2` distinct months at `±25%` amount and `±4` days           | Below 2 months we cannot tell recurring from one-off.                                               |
| Week-over-week delta       | Both windows have `≥ 3` txns in that category                  | Comparing 1 tx to 1 tx is anecdote, not delta.                                                      |

### 1.3 Where this is enforced

Each gate is computed in `src/utils/sufficiency.ts`. Every card in
`StatsScreen` wraps its chart in `<NeedMoreData>`, passing the gate's
`current / needed / reason`. The Intelligence Engine also short-circuits
internally — e.g. `detectAnomalies` returns `[]` rather than a low-confidence
anomaly when the baseline is too thin.

---

## 2. Statistical primitives

These live in `src/utils/statistics.ts` and are pure functions on `number[]`.

### 2.1 Arithmetic mean

$$
\bar{x} = \frac{1}{N} \sum_{i=1}^{N} x_i
$$

Used for **totals and per-day averages** only. **Not used** as the centre of
a distribution for spending — spending is right-skewed (rent and tuition
dwarf coffee), so a single ₱40,000 charge can yank the mean far from where
most observations sit. We use the **median** wherever we need a "typical"
value.

### 2.2 Median

For a sorted sample `x_{(1)} ≤ x_{(2)} ≤ … ≤ x_{(N)}`:

$$
\tilde{x} =
\begin{cases}
x_{(\frac{N+1}{2})} & \text{if } N \text{ is odd} \\
\tfrac{1}{2}\bigl(x_{(N/2)} + x_{(N/2+1)}\bigr) & \text{if } N \text{ is even}
\end{cases}
$$

Used as the **central tendency for "typical" amounts**: typical daily spend,
typical bill amount in recurring detection, typical category baseline.

### 2.3 Standard deviation (sample, Bessel-corrected)

$$
s = \sqrt{ \frac{1}{N-1} \sum_{i=1}^{N} (x_i - \bar{x})^2 }
$$

Used **only** when we have to plug into the t-distribution for a confidence
interval. We prefer MAD (next) as a robust scale estimator.

### 2.4 Median Absolute Deviation (MAD)

$$
\text{MAD} = \tilde{|x_i - \tilde{x}|}
$$

(Median of the absolute deviations from the median.) MAD is a **robust**
scale estimator — a single outlier can change MAD by at most one rank,
whereas standard deviation moves with the outlier's squared distance.

To make MAD a consistent estimator of σ for a normal distribution, we
multiply by **1.4826** (the reciprocal of the 75th percentile of the
standard normal). This is the standard "consistency constant" — see
Iglewicz & Hoaglin (1993).

$$
\hat{\sigma}_{\text{MAD}} = 1.4826 \cdot \text{MAD}
$$

### 2.5 Modified (robust) z-score

For each observation `x_i`:

$$
M_i = \frac{x_i - \tilde{x}}{1.4826 \cdot \text{MAD}}
$$

`|M_i| > 3.5` flags `x_i` as an outlier (Iglewicz-Hoaglin recommendation).
We use this for **anomaly detection** instead of "current > 1.5 × mean"
because:

- It's symmetric around the **median**, not the mean, so the baseline
  isn't dragged by past one-off purchases.
- The cutoff is scale-aware: a stable category with low MAD detects small
  excursions; a noisy category with high MAD demands a bigger move.
- The Iglewicz-Hoaglin cutoff of 3.5 is conservative for a normal
  distribution (≈ 0.05% expected false-positive rate per observation) and
  empirically robust on heavy-tailed financial data.

### 2.6 Coefficient of variation (CV)

$$
\text{CV} = \frac{s}{\bar{x}}
$$

(Or the robust analogue `MAD / median`.) CV is **unit-free**; it lets us
say "this merchant's amounts are stable" without arguing about whether ₱50
of variation is "a lot" — it's a lot for a ₱100 average, trivial for a
₱5,000 average.

We use CV ≤ 0.25 as the "amount looks recurring" threshold in subscription
detection.

### 2.7 95% Confidence interval

For a sample mean with sample size `N`:

- **`N ≥ 30`** (CLT regime) — normal approximation:

  $$
  \text{CI}_{95} = \bar{x} \pm 1.96 \cdot \frac{s}{\sqrt{N}}
  $$

- **`N < 30`** (small sample) — Student-t with `N − 1` df:

  $$
  \text{CI}_{95} = \bar{x} \pm t_{0.975, N-1} \cdot \frac{s}{\sqrt{N}}
  $$

We use the CI on the **end-of-month projection** so users see the projection
as a band (e.g. "₱42,000 — ₱58,000") rather than a single hyper-confident
point.

For small `N` (typically `N < 30`), we look up `t_{0.975, N-1}` from a
precomputed table. The implementation in `statistics.ts` hard-codes the
table for `N ∈ [2, 30]` and falls back to 1.96 above.

### 2.8 Linear regression (ordinary least squares)

For points `(i, y_i), i = 1..N`:

$$
\hat{\beta} = \frac{\sum_{i=1}^{N}(i - \bar{i})(y_i - \bar{y})}{\sum_{i=1}^{N}(i - \bar{i})^2}
$$

$$
\hat{\alpha} = \bar{y} - \hat{\beta} \cdot \bar{i}
$$

$$
R^2 = 1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2}
$$

Used for the **6-month net trend** to answer "is the user trending up or
down" and "how strong is the trend":

- `β > 0` → trending **up**, `β < 0` → trending **down**.
- `R² ≥ 0.6` → strong fit; we surface the slope verbally.
- `R² < 0.6` → weak fit; we suppress directional claims and show the bars
  only, no "trending up" headline.

### 2.9 Herfindahl-Hirschman Index (HHI)

For category shares `s_i = \text{amount}_i / \text{totalExpense}`:

$$
\text{HHI} = \sum_{i=1}^{K} s_i^2
$$

`HHI ∈ [1/K, 1]`. `HHI = 1` is total concentration in one category;
`HHI = 1/K` is perfectly uniform.

We use HHI for the **"concentration risk"** coach message:

- `HHI ≥ 0.45` → concentrated; the top category drives the headline.
- `HHI < 0.25` → diversified; we frame insights as "spread fairly evenly".

This is more honest than just looking at the largest share, because two
users with the same top-category share can have very different
distributions of the remaining spend (one concentrated in #2, one spread).

### 2.10 Effective sample size for proportions

For a proportion `p` from `N` Bernoulli trials, the standard error is

$$
\text{SE}(p) = \sqrt{ \frac{p(1-p)}{N} }
$$

We use this to decide when a "share of spend" claim (e.g. "Food is 42% of
your spend") is precise enough to surface. We require
`SE(p) ≤ 0.10` (i.e. ±10pp margin), which for `p ≈ 0.5` (the worst case)
requires `N ≥ 25`. The category-donut gate of `N ≥ 10` is below this
threshold deliberately — the chart shows ranks, not precise percentages —
but any chip that **quotes** a percentage requires the tighter gate.

---

## 3. Per-insight formulas

This section walks each card and chip on the Insights screen and states
exactly what is computed and how.

### 3.1 Cash flow totals

**Inputs:** all `monthTx` rows in the selected month.

$$
\text{income} = \sum_{t \in M,\, t.\text{type}=\text{income},\, \neg \text{transfer}} t.\text{amount}
$$

$$
\text{expense} = \sum_{t \in M,\, t.\text{type}=\text{expense},\, \neg \text{transfer}} t.\text{amount}
$$

$$
\text{net} = \text{income} - \text{expense}
$$

$$
\text{savingsRate} = \frac{\text{net}}{\text{income}}, \quad \text{income} > 0
$$

Adjustment rows **are included** in income/expense totals (real money) but
excluded from every behavioural breakdown below.

### 3.2 vs-prev-month delta

$$
\Delta_{\text{pct}} =
\begin{cases}
\dfrac{x_{\text{cur}} - x_{\text{prev}}}{x_{\text{prev}}} & x_{\text{prev}} > 0 \\
\text{"new"} & x_{\text{prev}} = 0,\ x_{\text{cur}} > 0 \\
\text{null} & \text{both zero or no prior month}
\end{cases}
$$

We render `"new"` rather than `+∞%` when the prior month has zero spend,
because the percentage is undefined and the misleading "+∞%" pill was
emotionally noisier than the actual signal.

### 3.3 Daily average

$$
\text{dailyAvg} = \frac{\text{expense}}{n_d^{\text{elapsed}}}
$$

Where `n_d^{elapsed}` is days elapsed in the selected month (the full
`daysInMonth` for past months, today's date for the current month).

This is currently the **mean** per day, which we keep for the cash-flow
card because that card displays an *amount*. Internally, for anomaly /
projection logic we use the **median** day's spend so a single big-ticket
day doesn't pull the central estimate.

### 3.4 Spending trajectory — projected end-of-month total

Two stages:

**Stage A — day-of-week-weighted projection** (preferred when we have
prior-month data):

Let `μ_dow[d]` = the user's average prior-month spend on weekday `d`
(`d ∈ {Mon..Sun}`), computed from the prior **3 months** of expense txns.

Let `μ_total` = the user's overall prior-3-month per-day mean.

Let `I = \text{dailyAvg}_{\text{current}} / μ_{\text{total}}` be the
**intensity scaling** — how heavy this month is running vs the user's
recent baseline.

Then for each remaining day `d` in the current month:

$$
\hat{x}_d = \mu_{\text{dow}}[d] \cdot I
$$

$$
\hat{x}_{\text{remaining}} = \sum_{d \in \text{remaining}} \hat{x}_d
$$

$$
\hat{x}_{\text{EOM}} = \text{spent} + \hat{x}_{\text{remaining}}
$$

This is preferred because spending is non-uniform across weekdays (Friday
≫ Tuesday for most users); a flat daily run-rate over-projects on weekday
queries done on a Sunday and under-projects on a Wednesday.

**Stage B — flat run-rate fallback** (used when prior-3-mo DoW data is
thin: fewer than 4 weekday buckets each with ≥ 2 samples):

$$
\hat{x}_{\text{EOM}} = \text{dailyAvg}_{\text{current}} \cdot n_{\text{days in month}}
$$

**Confidence band (proposed addition):**

The standard error of the projection is approximately

$$
\text{SE}(\hat{x}_{\text{EOM}}) = s_{\text{daily}} \cdot \sqrt{ n_{\text{remaining}} }
$$

where `s_daily` is the sample stddev of the user's daily expense for the
elapsed days of the month (treating each day as a draw from a daily-spend
distribution and assuming day-to-day independence — a simplification we
acknowledge in §5).

We display the 95% band as `EOM ± t_{0.975, n-1} · SE`. With `n < 30` we
use the t-distribution; otherwise normal.

### 3.5 Pacing relative to 3-month average

$$
\text{rolling3MoAvg} = \frac{1}{|M_{\text{prior}}|} \sum_{m \in M_{\text{prior}}} \text{expense}_m
$$

`M_prior` excludes the current month. We use this as the baseline because
12 months is too long a window for users who change jobs / cities / habits
and 1 month is too narrow to escape noise. Three is the smallest window
where the average is more than a noise estimate of any single month.

We flag `pacingOver` when:

$$
\hat{x}_{\text{EOM}} > 1.15 \cdot \text{rolling3MoAvg}
$$

The 15% buffer keeps the flag from firing on normal month-to-month wobble.

### 3.6 Anomaly detection (per category)

For each category in the current month with current spend `c`:

1. Compute baseline samples: the category's spend in each of the prior 3
   months. Call this `b = [b_1, b_2, b_3]` (months with zero are kept as
   zero, not dropped — a category appearing for the first time after 3
   months of zeros is itself an anomaly worth flagging).
2. Compute `median(b)`, `MAD(b)`, and `\hat{σ} = 1.4826 · MAD(b)`.
3. If `\hat{σ} > 0`, compute the modified z-score:

   $$
   M = \frac{c - \tilde{b}}{1.4826 \cdot \text{MAD}(b)}
   $$

   Flag the category if `M > 3.5` (positive-side outlier — we don't flag
   *under*spending as an anomaly because that's not an action signal).

4. **Degenerate case** — when `MAD(b) = 0` (all 3 prior months identical,
   common for fixed-amount subscriptions), z-score is undefined. We fall
   back to a percent-change rule:

   $$
   c > 1.5 \cdot \tilde{b}
   $$

   with the wider 50% margin to avoid flagging tiny absolute moves on a
   stable baseline.

5. Sort flagged categories by `M` descending and surface the top one in
   the `whereChip`.

**Why this replaces the previous `current > 1.5 × mean` rule:**

- The old rule used the **mean** baseline → one high prior month makes the
  baseline impossible to exceed, hiding real escalations.
- The old rule had a **fixed 50% cutoff** → stable categories (insurance,
  bills) needed unrealistic moves to flag, noisy categories (food, travel)
  flagged on normal variation.
- The robust z-score is scale-aware and trip-once-and-stay-flagged-
  honest.

### 3.7 Category share (donut + chip)

For each category `i`:

$$
s_i = \frac{\text{expense}_i}{\sum_j \text{expense}_j}
$$

Surface order is by `s_i` descending. The chip text uses `s_i` rounded to
the nearest percent.

**Concentration phrasing** uses HHI (§2.9):

- `HHI ≥ 0.45` → "{Top} dominates at X% — Y× more than {Second}".
- Else, if top merchant has `≥ 3` visits → highlight merchant pattern.
- Else, plain category share.

### 3.8 Top merchants

For each merchant `m`:

$$
\text{total}_m = \sum_{t \in M, t.\text{merchant} = m} t.\text{amount}
$$

$$
\text{visits}_m = |\{ t \in M, t.\text{merchant} = m \}|
$$

Sorted by `total_m` descending; top 10 surfaced.

We surface a merchant as a **habit** if `visits_m ≥ 3` *within the current
month*. The threshold of 3 comes from the smallest sample at which a
"pattern" claim can be made without being trivially explained by chance —
two visits to the same place in a month is a coin flip; three suggests
intent.

### 3.9 Day-of-week pattern

For each weekday `d ∈ {Mon, …, Sun}`:

$$
\mu_d = \frac{\sum_{t \in M, \text{dow}(t) = d} t.\text{amount}}{|\{ \text{distinct dates with dow}(t) = d \}|}
$$

The denominator is **distinct dates**, not transaction count — three coffee
runs on the same Tuesday count as one "Tuesday observation", not three.
This prevents the chart from over-weighting a habit-clustered weekday.

`peakDow = argmax(μ_d)`.

**Multiplier vs weekday average:**

$$
\rho = \frac{\mu_{\text{peakDow}}}{\frac{1}{5} \sum_{d \in \text{weekdays}} \mu_d}
$$

We render `"Saturdays are your peak — 2.1× weekday average"` when `ρ ≥ 1.5`.

**Proposed augmentation — chi-squared test for non-uniformity:**

To answer "is this DoW pattern real or random?", we compute a chi-squared
statistic against the null of uniform DoW distribution:

$$
\chi^2 = \sum_{d=1}^{7} \frac{(O_d - E_d)^2}{E_d}, \quad E_d = \frac{\text{totalExpense}}{7}
$$

With `df = 6`, the 95% critical value is **12.59**. If `χ² < 12.59` the
pattern is consistent with uniform spending and we suppress the "peak day"
claim, falling back to "Mostly even across the week".

### 3.10 Time-of-day pattern

Buckets:

- **Morning**: `5:00 ≤ h < 12:00`
- **Afternoon**: `12:00 ≤ h < 17:00`
- **Evening**: `17:00 ≤ h < 21:00`
- **Night**: otherwise (`21:00 ≤ h < 5:00`)

For each bucket `b`:

$$
\text{total}_b = \sum_{t \in M, \text{bucket}(t) = b} t.\text{amount}
$$

$$
\text{share}_b = \frac{\text{total}_b}{\sum_b \text{total}_b}
$$

`peakBucket = argmax(total_b)`.

Same chi-squared test as DoW with `df = 3` (4 buckets), 95% critical value
**7.81**. Below this we suppress the "X dominate" claim.

### 3.11 Recurring bill detection

Operates on prior-3-month txns. A merchant `m` qualifies as recurring if:

1. **Frequency**: appears in `≥ 2` distinct calendar months.
2. **Amount stability**: median amount `\tilde{a}_m > 0` and every monthly
   occurrence is within `±25%` of `\tilde{a}_m`.
   Equivalently: `MAD(a_m) / \tilde{a}_m ≤ 0.25`.
3. **Date stability**: every occurrence's day-of-month is within `±4` days
   of the median day.

For each recurring merchant, the **next estimated charge date** is the
median day-of-month projected onto the current month (or next month if the
median day has already passed).

`daysUntilNext = (nextDate − today) / 86_400_000`, rounded.

### 3.12 Habits (small-but-frequent)

A merchant `m` is a "habit" if **all** of:

- `visits_m ≥ 4` in the current month.
- Average ticket `\bar{a}_m ≤ ₱300`.

Annualised impact:

$$
\text{annualised} = \frac{\text{visits}_m \cdot \bar{a}_m \cdot n_{\text{days in month}}}{n_{\text{days elapsed}}} \cdot 12
$$

The intra-month scaling `n_days_in_month / n_days_elapsed` extrapolates the
elapsed-portion visits to a full month before annualising. Without it,
mid-month checks would understate the impact by `daysElapsed/daysInMonth`.

### 3.13 Week-over-week delta

For each category:

- `currentWeek` = sum of expense in `(now - 7d, now]`.
- `prevWeek` = sum of expense in `(now - 14d, now - 7d]`.

$$
\Delta_{\text{wow}} = \frac{\text{currentWeek} - \text{prevWeek}}{\text{prevWeek}}, \quad \text{prevWeek} > 0
$$

Surfaced only when `|Δ_wow| ≥ 0.20` (i.e. ≥ 20% move) — below this the
delta is below typical week-to-week noise for any individual user.

### 3.14 6-month net trend slope (proposed)

For the 6-month net series `(i, \text{net}_i), i = 1..6`:

1. Drop months with `net_i = 0` and `txCount_i = 0` (no data at all,
   distinct from "earned and spent equal").
2. Require `≥ 3` remaining points (else "trend" is meaningless).
3. Compute OLS slope `\hat{β}` and `R^2` (§2.8).

We render:

- `R² ≥ 0.6` and `β > 0` → "Trending up — ₱{β} per month, R² = {R²}".
- `R² ≥ 0.6` and `β < 0` → "Trending down".
- `R² < 0.6` → "No clear trend over 6 months".

---

## 4. Coach message logic

The coach message is a **decision tree**, not a formula, but each branch
is gated on the statistics above. In order:

1. **Negative net**: `income > 0` and `net < 0` → corrective.
2. **Strong over-pace**: `projected > 1.15 × rolling3MoAvg` → cautious.
3. **Concentration risk**: HHI ≥ 0.45 → cautious.
4. **Strong savings**: `savingsRate ≥ 0.30` → positive.
5. **Decent savings**: `0.15 ≤ savingsRate < 0.30` → positive.
6. **Under-pacing**: `projected < 0.90 × rolling3MoAvg` → positive.
7. **Default**: neutral nudge on top category.

The 15% / 10% buffers around the 3-mo baseline are deliberately
asymmetric — "over-pace" is a louder message than "under-pace", and the
asymmetry keeps both tones from firing at small wobbles.

---

## 5. Caveats and limitations

These are the assumptions baked into the math. They are not bugs but they
constrain the interpretation:

1. **Independence assumption in CI.** The trajectory standard error (§3.4)
   treats each daily spend total as an independent draw. In reality
   spending has weekly autocorrelation (paydays, weekends). The CI is
   therefore an **under**-estimate of true uncertainty by a factor that
   depends on the autocorrelation. We accept this because (a) the
   directional message ("over" vs "under" pace) is robust to it and (b)
   modelling AR(1) on 30 daily observations isn't statistically defensible
   either.

2. **Anomaly z-score assumes ~normal baseline.** Spending categories are
   not normal. The Iglewicz-Hoaglin 3.5 cutoff is conservative for any
   reasonable unimodal distribution but the false-positive rate isn't
   exactly 0.05% on real data. We treat the cutoff as a sensible operating
   point, not a probabilistic guarantee.

3. **Chi-squared assumes ≥ 5 expected per bucket.** With `expense < ₱35`
   total in a month (effectively no spend), the chi-squared expected
   counts can dip below the test's validity threshold. The sufficiency
   gate of `≥ 14` txns for DoW and `≥ 15` for TOD keeps us inside the
   validity region in practice; we add a hard floor of `expected ≥ 5`
   in the implementation as a belt-and-braces check.

4. **Recurring detection misses true monthly bills with > 25% wobble.**
   E.g. utility bills that swing widely with weather. Tightening the band
   would catch them at the cost of false-positives on lumpy categories.
   This is a tunable; current setting is optimised for subscriptions.

5. **3-month baseline is short.** Seasonality (December, school fees,
   tax-time) will look like an anomaly. We accept this — surfacing
   seasonality as an anomaly *is* a useful insight, even if it's not
   statistically surprising to the user.

6. **HHI ignores transfers between categories.** Renaming a category
   doesn't change HHI; merging two categories *does*. This makes HHI
   stable to display tweaks but sensitive to taxonomy changes — keep this
   in mind when comparing HHI across taxonomy versions.

---

## 6. References

- Iglewicz, B. & Hoaglin, D. (1993). *Volume 16: How to Detect and Handle
  Outliers*. ASQ Quality Press. — Source of the modified z-score and 3.5
  cutoff.
- Huber, P. J. (1981). *Robust Statistics*. Wiley. — MAD-as-σ-estimator
  consistency factor (1.4826).
- Cochran, W. G. (1977). *Sampling Techniques*, 3rd ed. — Sample-size /
  margin-of-error formulas underlying the sufficiency gates.
- Box, G. E. P., Jenkins, G. M. & Reinsel, G. C. (2008). *Time Series
  Analysis*. — Caveats around the independence assumption in §5.
- NIST/SEMATECH e-Handbook of Statistical Methods,
  §1.3.5.17 (Chi-Square Goodness-of-Fit Test). — Validity conditions used
  for the DoW/TOD tests.
