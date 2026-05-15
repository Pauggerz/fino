/**
 * Sample-size sufficiency gates for the Insights screen.
 *
 * Every chart and chip on the Insights screen calls into a gate here before
 * rendering. The gate returns `{ ok, current, needed, reason }`:
 *   - `ok`     → render the chart normally.
 *   - `!ok`    → render the "needs more data" overlay with `reason`.
 *
 * Thresholds and their justifications are documented in §1 of
 * `docs/INSIGHTS_FORMULAS.md` — keep that doc in sync when you tune a gate.
 *
 * Design rules:
 *   - Every threshold is tied to a specific failure mode (rank instability,
 *     wide CI, undefined statistic), not pulled from thin air.
 *   - `reason` is user-facing — write it in plain English, no jargon.
 *   - Gates are pure functions on the aggregated bundle; never call the DB.
 */

export type Sufficiency = {
  /** Whether the underlying statistic is reliable enough to surface. */
  ok: boolean;
  /** Current observed count (txns / days / months — depends on the gate). */
  current: number;
  /** Threshold the gate requires. */
  needed: number;
  /** Short user-facing explanation when `!ok`. */
  reason: string;
};

// Helper that builds a uniform "log N more transaction(s)" reason string for
// gates that fail purely on transaction count. Keeps copy consistent across
// cards so the user learns the pattern.
function moreTxns(needed: number, current: number): string {
  const remaining = Math.max(1, needed - current);
  return `Log ${remaining} more transaction${remaining === 1 ? '' : 's'} this month to unlock this chart.`;
}

// ─── Cash flow ──────────────────────────────────────────────────────────────

/**
 * Cash-flow totals card is always shown — even a single transaction is a
 * valid number to display. The gate only suppresses the "savings rate"
 * pill when income is zero.
 */
export function checkCashFlow(args: {
  hasIncome: boolean;
  hasExpense: boolean;
}): Sufficiency {
  const current = (args.hasIncome ? 1 : 0) + (args.hasExpense ? 1 : 0);
  return {
    ok: current >= 1,
    current,
    needed: 1,
    reason: 'Add an income or expense to start tracking cash flow.',
  };
}

/**
 * Sankey needs both sides — without income the flow has no source; without
 * expense it has no terminal nodes.
 */
export function checkSankey(args: {
  hasIncome: boolean;
  hasExpense: boolean;
}): Sufficiency {
  const current = (args.hasIncome ? 1 : 0) + (args.hasExpense ? 1 : 0);
  return {
    ok: args.hasIncome && args.hasExpense,
    current,
    needed: 2,
    reason: 'Log at least one income and one expense to draw the flow.',
  };
}

// ─── Trajectory / projection ────────────────────────────────────────────────

/**
 * Projection variance scales with 1/√N. Below ~10 txns the 95% CI on the EOM
 * projection exceeds the projection itself, so the chart misleads more than
 * it informs. We also require ≥7 days elapsed so the per-day rate isn't
 * estimated off a single shopping spree on day 1.
 *
 * Thresholds: txCount ≥ 10 AND daysElapsed ≥ 7.
 */
export function checkTrajectory(args: {
  txCount: number;
  daysElapsed: number;
}): Sufficiency {
  if (args.daysElapsed < 7) {
    return {
      ok: false,
      current: args.daysElapsed,
      needed: 7,
      reason: `Need ${7 - args.daysElapsed} more day${7 - args.daysElapsed === 1 ? '' : 's'} of data before projection is reliable.`,
    };
  }
  return {
    ok: args.txCount >= 10,
    current: args.txCount,
    needed: 10,
    reason: moreTxns(10, args.txCount),
  };
}

// ─── Day-of-week pattern ────────────────────────────────────────────────────

/**
 * "Peak weekday" needs at least one observation in a majority of weekdays —
 * otherwise we're declaring a peak with empty buckets. We require ≥14 txns
 * and ≥4 of 7 weekdays populated. With fewer than 14 we're below the
 * chi-squared validity threshold (expected count per bucket would be < 2).
 */
export function checkDowPattern(args: {
  txCount: number;
  populatedWeekdays: number;
}): Sufficiency {
  if (args.txCount < 14) {
    return {
      ok: false,
      current: args.txCount,
      needed: 14,
      reason: moreTxns(14, args.txCount),
    };
  }
  if (args.populatedWeekdays < 4) {
    return {
      ok: false,
      current: args.populatedWeekdays,
      needed: 4,
      reason: `Need transactions on ${4 - args.populatedWeekdays} more weekday${4 - args.populatedWeekdays === 1 ? '' : 's'} to see a real pattern.`,
    };
  }
  return { ok: true, current: args.txCount, needed: 14, reason: '' };
}

// ─── Time-of-day pattern ────────────────────────────────────────────────────

/**
 * Same logic as DoW with k = 4 buckets instead of 7. Need ≥15 txns so the
 * expected-per-bucket count is ≥ ~3.75 (close enough to the chi-squared
 * validity floor of 5 once a real signal is present), and ≥2 populated
 * buckets so "peak" actually means something.
 */
export function checkTodPattern(args: {
  txCount: number;
  populatedBuckets: number;
}): Sufficiency {
  if (args.txCount < 15) {
    return {
      ok: false,
      current: args.txCount,
      needed: 15,
      reason: moreTxns(15, args.txCount),
    };
  }
  if (args.populatedBuckets < 2) {
    return {
      ok: false,
      current: args.populatedBuckets,
      needed: 2,
      reason: 'All transactions land in one part of the day — need spread to see a pattern.',
    };
  }
  return { ok: true, current: args.txCount, needed: 15, reason: '' };
}

// ─── Category donut / composition ───────────────────────────────────────────

/**
 * Donut is a rank chart — surface order needs to be stable, which requires
 * ≥10 txns. Also require ≥3 distinct categories: with 1–2 the donut is a
 * trivial pie and the chip "X is your biggest category" is tautological.
 */
export function checkComposition(args: {
  expenseTxCount: number;
  categoryCount: number;
}): Sufficiency {
  if (args.expenseTxCount < 10) {
    return {
      ok: false,
      current: args.expenseTxCount,
      needed: 10,
      reason: moreTxns(10, args.expenseTxCount),
    };
  }
  if (args.categoryCount < 3) {
    return {
      ok: false,
      current: args.categoryCount,
      needed: 3,
      reason: 'Tag transactions in more categories to see how spend splits.',
    };
  }
  return { ok: true, current: args.expenseTxCount, needed: 10, reason: '' };
}

// ─── Top merchant "habit" claim ─────────────────────────────────────────────

/**
 * Two visits could be coincidence; three is the smallest sample where a
 * "regular merchant" claim is defensible.
 */
export function checkMerchantHabit(args: { visits: number }): Sufficiency {
  return {
    ok: args.visits >= 3,
    current: args.visits,
    needed: 3,
    reason: 'Need at least 3 visits to call this a regular merchant.',
  };
}

// ─── Anomaly baseline ───────────────────────────────────────────────────────

/**
 * Robust z-score needs both a baseline median AND a non-zero MAD. We require
 * ≥2 prior months with spend in the category (any month with zero is kept
 * as a zero observation — see §3.6 of the docs).
 */
export function checkAnomalyBaseline(args: {
  priorMonthsWithSpend: number;
  baselineMad: number;
}): Sufficiency {
  if (args.priorMonthsWithSpend < 2) {
    return {
      ok: false,
      current: args.priorMonthsWithSpend,
      needed: 2,
      reason: 'Need 2 prior months of spend in this category before flagging anomalies.',
    };
  }
  // MAD = 0 isn't a "needs more data" case in the user-facing sense — it
  // means the category is perfectly stable, so a fallback rule applies.
  // We still return ok = true here; the engine handles the degenerate case.
  return { ok: true, current: args.priorMonthsWithSpend, needed: 2, reason: '' };
}

// ─── 6-month trend slope ────────────────────────────────────────────────────

/**
 * OLS slope on < 3 points is either undefined (N < 2) or perfectly
 * determined with R² = 1 (N = 2). Either way it conveys no real information.
 */
export function checkTrendSlope(args: {
  monthsWithData: number;
}): Sufficiency {
  return {
    ok: args.monthsWithData >= 3,
    current: args.monthsWithData,
    needed: 3,
    reason: `Need ${Math.max(1, 3 - args.monthsWithData)} more month${3 - args.monthsWithData === 1 ? '' : 's'} of activity to chart a trend.`,
  };
}

// ─── Quoted percentage (precision gate) ─────────────────────────────────────

/**
 * Worst-case SE for a proportion p ≈ 0.5 with sample size N is √(0.25/N).
 * To get the 95% margin under ±10pp we need N ≥ 96; under ±20pp we need
 * N ≥ 25. We use ±20pp as the threshold for chips that **quote** a specific
 * percentage (e.g. "Food is 42% of spend") — the donut chart itself shows
 * ranks not percentages and uses the looser composition gate.
 */
export function checkQuotedPercentage(args: { txCount: number }): Sufficiency {
  return {
    ok: args.txCount >= 25,
    current: args.txCount,
    needed: 25,
    reason: moreTxns(25, args.txCount),
  };
}
