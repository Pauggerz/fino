/**
 * Fino Intelligence — local-first insight engine.
 *
 * Reads directly from WatermelonDB so it works fully offline. Used by:
 *  - Insights screen (chips + headline)
 *  - Add transaction flow (category suggestions)
 *  - Online AI/chat features (as grounding context for the LLM)
 *
 * All exported functions are pure with respect to their inputs (apart from
 * the DB read) — they never mutate the database.
 */

import { Q } from '@nozbe/watermelondb';
import { database } from '@/db';
import type TransactionModel from '@/db/models/Transaction';
import { analyzeTransactionText } from '@/intelligence/categorize/categorize';
import fmtPeso from '@/utils/format';
import {
  median,
  madSigma,
  stddev,
  tCritical95,
  chi2Uniform,
  linearRegression,
} from '@/utils/statistics';
import {
  checkComposition,
  checkDowPattern,
  checkSankey,
  checkTodPattern,
  checkTrajectory,
  checkTrendSlope,
  type Sufficiency,
} from '@/utils/sufficiency';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Anomaly = {
  category: string;
  current: number;
  baseline: number;
  pctOver: number; // 0.5 → 50% over baseline
};

export type TrajectoryForecast = {
  /** Projected end-of-month total. Day-of-week-weighted when we have enough
   *  history to derive a per-weekday multiplier; otherwise a flat run rate. */
  projected: number;
  /** Spent so far. */
  spent: number;
  /** Daily average so far. */
  dailyAvg: number;
  /** Days elapsed in the current month. */
  daysElapsed: number;
  /** Days remaining in the current month. */
  daysRemaining: number;
  /** Rolling 3-month avg of monthly expense (excluding the current month). */
  rolling3MoAvg: number;
  /** True if current pace puts the user above their 3-mo avg. */
  pacingOver: boolean;
  /** True when the projection used per-weekday weighting (vs flat dailyAvg). */
  usedDowWeighting: boolean;
  /** Lower 95% bound on the EOM projection (Student-t for N<30, normal otherwise). */
  ciLow: number;
  /** Upper 95% bound on the EOM projection. */
  ciHigh: number;
  /** True when the CI used the t-distribution (i.e. daysElapsed < 30). */
  ciUsedT: boolean;
};

export type TrendSlope = {
  /** OLS slope of the 6-month net series in pesos / month. Sign = direction. */
  slope: number;
  /** Coefficient of determination, R² ∈ [0, 1]. */
  r2: number;
  /** Months that contributed to the regression (zero-spend months dropped). */
  n: number;
  /** 'up' when slope > 0 and R² ≥ 0.6; 'down' when slope < 0 and R² ≥ 0.6;
   *  'flat' otherwise. We refuse to claim a direction below R² = 0.6 because
   *  the fit isn't strong enough to call the slope. */
  direction: 'up' | 'down' | 'flat';
};

export type RecurringBill = {
  merchant: string;
  category: string | null;
  /** Typical amount (median across prior occurrences). */
  amount: number;
  /** Typical day-of-month it lands on. */
  dayOfMonth: number;
  /** Number of prior months this charge appeared in. */
  monthsObserved: number;
  /** ISO date of the next predicted charge, or null if it likely already hit. */
  nextEstimatedDate: string | null;
  /** Estimated days until the next charge (negative if past-due-looking). */
  daysUntilNext: number | null;
};

export type Sentiment = 'positive' | 'neutral' | 'cautious' | 'negative';

export type CoachMessage = {
  sentiment: Sentiment;
  /** Short, actionable one-liner the UI can surface as the "coach" tip. */
  message: string;
};

export type Habit = {
  merchant: string;
  category: string | null;
  visitsPerMonth: number;
  avgAmount: number;
  monthlySpend: number;
  /** Annualized impact (monthlySpend × 12). */
  annualized: number;
};

export type WeekDelta = {
  category: string;
  currentWeek: number;
  prevWeek: number;
  pctChange: number; // 0.25 → +25%
};

/**
 * Per-card sufficiency verdicts. Each gate is documented in
 * `docs/INSIGHTS_FORMULAS.md` §1.2 and implemented in `@/utils/sufficiency`.
 * The screen reads these to decide whether to render each chart or surface
 * the "needs more data" overlay with the gate's reason string.
 */
export type InsightsSufficiency = {
  sankey: Sufficiency;
  trajectory: Sufficiency;
  composition: Sufficiency;
  dowPattern: Sufficiency;
  todPattern: Sufficiency;
  trendSlope: Sufficiency;
};

export type Insights = {
  headline: string;
  whereChip: string;
  whenChip: string;
  anomalies: Anomaly[];
  trajectory: TrajectoryForecast | null;
  habits: Habit[];
  weekDeltas: WeekDelta[];
  /** Detected recurring bills/subscriptions from prior 3 months. */
  recurring: RecurringBill[];
  /** Localised financial coach tip — sentiment + actionable message. */
  coach: CoachMessage;
  /** OLS slope + R² over the 6-month net series. Null when <3 months of data. */
  trendSlope: TrendSlope | null;
  /** Per-card sufficiency verdicts driving the "needs more data" overlays. */
  sufficiency: InsightsSufficiency;
};

export type CategorySuggestion = {
  category: string;
  confidence: 'high' | 'medium' | 'low';
  /** 'history' = matched by user's prior transactions; 'keyword' = static dictionary; 'none' */
  source: 'history' | 'keyword' | 'none';
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function isTransferRow(t: TransactionModel): boolean {
  return t.isTransfer || (t.category ?? '').toLowerCase() === 'transfer';
}

// Reconciliation rows are real money (kept in income/expense totals) but they
// don't represent spending behavior — exclude them from category breakdowns,
// merchant patterns, and trend/anomaly comparisons that drive insight chips.
function isAdjustmentRow(t: TransactionModel): boolean {
  return (t.category ?? '').toLowerCase() === 'adjustment';
}

function startOfMonthIso(year: number, month: number): string {
  return new Date(year, month, 1).toISOString();
}

function endOfMonthIso(year: number, month: number): string {
  return new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
}

function cap(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Aggregation primitives ─────────────────────────────────────────────────

function sumExpensesByCategory(
  txns: TransactionModel[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const key = (t.category ?? '').trim().toLowerCase();
    if (!key) continue;
    out[key] = (out[key] ?? 0) + t.amount;
  }
  return out;
}

function sumByMerchant(
  txns: TransactionModel[]
): Record<string, { total: number; count: number; category: string | null }> {
  const out: Record<
    string,
    { total: number; count: number; category: string | null }
  > = {};
  for (const t of txns) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const raw =
      (t.merchantName ?? '').trim() ||
      (t.displayName ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const slot = out[key] ?? { total: 0, count: 0, category: null };
    slot.total += t.amount;
    slot.count += 1;
    if (!slot.category && t.category) slot.category = t.category;
    out[key] = slot;
  }
  return out;
}

// ─── Detectors ──────────────────────────────────────────────────────────────

/**
 * Anomaly detection via the **Iglewicz-Hoaglin modified z-score** on a
 * per-category, per-prior-month baseline. See §3.6 of
 * `docs/INSIGHTS_FORMULAS.md` for the full derivation.
 *
 * Algorithm:
 *   1. Bucket prior-3-month expense txns into a 3-element array `b` per
 *      category. Months with zero spend in that category contribute a 0 —
 *      not a missing observation. (A category appearing this month after
 *      3 zeros is itself worth flagging.)
 *   2. Compute median(b) and σ̂ = 1.4826 · MAD(b).
 *   3. If σ̂ > 0 → flag when (current − median) / σ̂ > 3.5
 *      (Iglewicz-Hoaglin outlier cutoff; conservative on heavy-tailed data).
 *   4. If σ̂ = 0 (perfectly stable subscription) → fall back to
 *      current > 1.5 · median (50% margin chosen wide enough to ignore
 *      cent-level rounding).
 *   5. Require ≥2 prior months with non-zero spend before flagging
 *      (avoids "appeared once, now anomalous" false-positives).
 *
 * Result is sorted by `pctOver` desc so the worst offender drives the chip.
 */
function detectAnomalies(
  currentByCat: Record<string, number>,
  prior3MoTx: TransactionModel[],
  priorMonthKeys: string[]
): Anomaly[] {
  // Build month → category → amount. Initialise every prior month even when
  // empty so the baseline array always has length = priorMonthKeys.length and
  // zero-spend months count as 0 observations.
  const byMonthCat: Record<string, Record<string, number>> = {};
  for (const mk of priorMonthKeys) byMonthCat[mk] = {};
  for (const t of prior3MoTx) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const mk = t.date.slice(0, 7);
    if (!(mk in byMonthCat)) continue;
    const cat = (t.category ?? '').trim().toLowerCase();
    if (!cat) continue;
    byMonthCat[mk][cat] = (byMonthCat[mk][cat] ?? 0) + t.amount;
  }

  const out: Anomaly[] = [];
  for (const [cat, current] of Object.entries(currentByCat)) {
    if (current <= 0) continue;
    const baseline = priorMonthKeys.map((mk) => byMonthCat[mk][cat] ?? 0);
    const monthsWithSpend = baseline.filter((b) => b > 0).length;

    // Sufficiency gate — see checkAnomalyBaseline in @/utils/sufficiency.
    if (monthsWithSpend < 2) continue;

    const med = median(baseline);
    const sigma = madSigma(baseline);

    let flagged = false;
    let pctOver = 0;
    if (sigma > 0) {
      // Robust z-score: M = (x − median) / (1.4826 · MAD). Cutoff |M| > 3.5
      // is Iglewicz-Hoaglin (1993). We only flag positive-side excursions —
      // *under*-spending isn't an action signal.
      const z = (current - med) / sigma;
      if (z > 3.5) {
        flagged = true;
        pctOver = med > 0 ? (current - med) / med : 0;
      }
    } else if (med > 0) {
      // MAD = 0: baseline is perfectly stable (e.g. fixed-amount
      // subscription). Z-score is undefined — fall back to a 50% margin
      // on the median (wider than the z-score equivalent to avoid
      // flagging on cent-level rounding).
      if (current > med * 1.5) {
        flagged = true;
        pctOver = (current - med) / med;
      }
    }
    if (!flagged) continue;

    out.push({ category: cat, current, baseline: med, pctOver });
  }

  return out.sort((a, b) => b.pctOver - a.pctOver);
}

/**
 * Sum prior-month expenses bucketed by day-of-week (0=Mon … 6=Sun).
 * Returns null per-bucket when there's not enough history to weight.
 */
function dayOfWeekAverages(
  txns: TransactionModel[]
): { avgByDow: number[]; totalAvg: number; samplesByDow: number[] } {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const seenByDow: Set<string>[] = [
    new Set(),
    new Set(),
    new Set(),
    new Set(),
    new Set(),
    new Set(),
    new Set(),
  ];
  for (const t of txns) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const dow = (new Date(t.date).getDay() + 6) % 7; // 0 = Mon
    totals[dow] += t.amount;
    seenByDow[dow].add(t.date.slice(0, 10));
  }
  const samplesByDow = seenByDow.map((s) => s.size);
  const avgByDow = totals.map((sum, i) =>
    samplesByDow[i] > 0 ? sum / samplesByDow[i] : 0
  );
  const sumSamples = samplesByDow.reduce((s, n) => s + n, 0);
  const totalAvg =
    sumSamples > 0
      ? totals.reduce((s, n) => s + n, 0) / sumSamples
      : 0;
  return { avgByDow, totalAvg, samplesByDow };
}

function forecastTrajectory(
  monthSpent: number,
  daysElapsed: number,
  daysInMonth: number,
  prior3MoTotal: number,
  prior3MoCount: number,
  args: {
    /** Year/month of the forecast horizon (used to compute remaining day-of-week). */
    year: number;
    month: number;
    /** Prior-month transactions used to derive day-of-week multipliers. */
    priorTxns: TransactionModel[];
    /** Per-day expense totals for the elapsed days of the current month.
     *  Used to estimate the variance of daily spend for the CI calculation. */
    elapsedDailyTotals: number[];
  }
): TrajectoryForecast {
  const dailyAvg = daysElapsed > 0 ? monthSpent / daysElapsed : 0;
  const rolling3MoAvg =
    prior3MoCount > 0 ? prior3MoTotal / prior3MoCount : 0;

  // Day-of-week-aware projection: use the user's historical per-weekday
  // average to project the remaining days in the current month. Falls back
  // to the flat daily run rate when we don't have at least 4 buckets with
  // ≥2 samples each.
  const { avgByDow, totalAvg, samplesByDow } = dayOfWeekAverages(
    args.priorTxns
  );
  const populatedBuckets = samplesByDow.filter((n) => n >= 2).length;
  const usedDowWeighting = populatedBuckets >= 4 && totalAvg > 0;

  let projected: number;
  if (usedDowWeighting) {
    let projectedRemaining = 0;
    for (let day = daysElapsed + 1; day <= daysInMonth; day++) {
      const dow =
        (new Date(args.year, args.month, day).getDay() + 6) % 7;
      const bucketAvg = avgByDow[dow] > 0 ? avgByDow[dow] : totalAvg;
      // Scale the historical bucket average to match this user's current
      // spending intensity (so a heavier-than-usual month still projects up).
      const intensity = dailyAvg > 0 ? dailyAvg / totalAvg : 1;
      projectedRemaining += bucketAvg * intensity;
    }
    projected = monthSpent + projectedRemaining;
  } else {
    projected = dailyAvg * daysInMonth;
  }

  // ── 95% confidence interval on the EOM projection ────────────────────
  //
  // We treat each elapsed day's expense total as an i.i.d. draw from a
  // daily-spend distribution. The standard error of the sum of the
  // remaining N_r days is then
  //     SE(sum_remaining) = s_daily · √N_r
  // (variance of a sum of i.i.d. variables = N · variance of one).
  // For N_r < 30 we widen by Student-t; otherwise the normal approx (1.96).
  //
  // Caveat (documented in §5.1 of INSIGHTS_FORMULAS.md): real daily spend
  // has weekly autocorrelation, so this SE is an under-estimate of the
  // true uncertainty. We accept this — the directional message is robust
  // to the simplification, and modelling AR(1) on ≤30 daily observations
  // is not statistically defensible either.
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  const sDaily = stddev(args.elapsedDailyTotals);
  let ciMargin = 0;
  let ciUsedT = false;
  if (sDaily > 0 && daysRemaining > 0 && daysElapsed >= 2) {
    const seRemaining = sDaily * Math.sqrt(daysRemaining);
    ciUsedT = daysElapsed < 30;
    const t = ciUsedT ? tCritical95(daysElapsed - 1) : 1.96;
    ciMargin = t * seRemaining;
  }
  const ciLow = Math.max(monthSpent, projected - ciMargin);
  const ciHigh = projected + ciMargin;

  return {
    projected,
    spent: monthSpent,
    dailyAvg,
    daysElapsed,
    daysRemaining,
    rolling3MoAvg,
    pacingOver: rolling3MoAvg > 0 && projected > rolling3MoAvg,
    usedDowWeighting,
    ciLow,
    ciHigh,
    ciUsedT,
  };
}

// ─── Recurring bill detection ───────────────────────────────────────────────

/**
 * Detects recurring expenses across the prior 3 months. A merchant qualifies
 * when it appears in ≥2 distinct months at the same approximate amount
 * (within ±25%) and roughly the same day-of-month (±4 days). Returns a list
 * sorted by the next expected charge.
 */
function detectRecurring(
  prior3MoTx: TransactionModel[],
  now: Date
): RecurringBill[] {
  type Hit = {
    amount: number;
    monthKey: string;
    dayOfMonth: number;
    category: string | null;
  };
  const groups = new Map<string, Hit[]>();
  for (const t of prior3MoTx) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const merchant =
      ((t.merchantName ?? '').trim() ||
        (t.displayName ?? '').trim()).toLowerCase();
    if (!merchant) continue;
    const d = new Date(t.date);
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    const slot = groups.get(merchant) ?? [];
    slot.push({
      amount: t.amount,
      monthKey,
      dayOfMonth: d.getDate(),
      category: (t.category ?? null) || null,
    });
    groups.set(merchant, slot);
  }

  const out: RecurringBill[] = [];
  for (const [merchant, hits] of groups) {
    // Keep only the largest charge per (merchant, month) so subscriptions
    // aren't drowned out by multiple grocery trips at the same store.
    const byMonth = new Map<string, Hit>();
    for (const h of hits) {
      const cur = byMonth.get(h.monthKey);
      if (!cur || h.amount > cur.amount) byMonth.set(h.monthKey, h);
    }
    const monthly = Array.from(byMonth.values());
    if (monthly.length < 2) continue;

    const amounts = monthly.map((h) => h.amount);
    const med = median(amounts);
    if (med <= 0) continue;
    // All amounts must land within ±25% of the median (subscriptions are
    // usually identical; bills wobble within this band).
    const withinBand = amounts.every(
      (a) => Math.abs(a - med) / med <= 0.25
    );
    if (!withinBand) continue;

    const days = monthly.map((h) => h.dayOfMonth);
    const medDay = Math.round(median(days));
    const dayConsistent = days.every((d) => Math.abs(d - medDay) <= 4);
    if (!dayConsistent) continue;

    // Build the next-charge estimate. Try this month first; if the typical
    // day-of-month has already passed, look at next month instead.
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDayThis = new Date(year, month + 1, 0).getDate();
    let nextDate: Date | null = new Date(
      year,
      month,
      Math.min(medDay, lastDayThis)
    );
    if (nextDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
      const lastDayNext = new Date(year, month + 2, 0).getDate();
      nextDate = new Date(year, month + 1, Math.min(medDay, lastDayNext));
    }
    const daysUntilNext = nextDate
      ? Math.round(
          (nextDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        )
      : null;

    out.push({
      merchant,
      category:
        monthly.find((h) => h.category)?.category ?? null,
      amount: Math.round(med * 100) / 100,
      dayOfMonth: medDay,
      monthsObserved: monthly.length,
      nextEstimatedDate: nextDate ? nextDate.toISOString() : null,
      daysUntilNext,
    });
  }

  // Soonest upcoming charges first; tie-break on amount.
  return out.sort((a, b) => {
    const ad = a.daysUntilNext ?? 999;
    const bd = b.daysUntilNext ?? 999;
    if (ad !== bd) return ad - bd;
    return b.amount - a.amount;
  });
}

// ─── Coach / sentiment ──────────────────────────────────────────────────────

function buildCoachMessage(args: {
  totalIncome: number;
  totalExpense: number;
  trajectory: TrajectoryForecast;
  currentByCat: Record<string, number>;
  monthTx: TransactionModel[];
  isCurrent: boolean;
}): CoachMessage {
  const {
    totalIncome,
    totalExpense,
    trajectory,
    currentByCat,
    monthTx,
    isCurrent,
  } = args;

  if (totalIncome === 0 && totalExpense === 0) {
    return {
      sentiment: 'neutral',
      message:
        'Add a few transactions to unlock tailored coaching from Fino.',
    };
  }

  // Weekend vs weekday pressure — useful for pinpointing leisure overspend.
  let weekdaySum = 0;
  let weekendSum = 0;
  let weekdayDays = new Set<string>();
  let weekendDays = new Set<string>();
  for (const t of monthTx) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const d = new Date(t.date);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    const dateKey = t.date.slice(0, 10);
    if (dow === 0 || dow === 6) {
      weekendSum += t.amount;
      weekendDays.add(dateKey);
    } else {
      weekdaySum += t.amount;
      weekdayDays.add(dateKey);
    }
  }
  const weekdayAvg =
    weekdayDays.size > 0 ? weekdaySum / weekdayDays.size : 0;
  const weekendAvg =
    weekendDays.size > 0 ? weekendSum / weekendDays.size : 0;
  const weekendHeavy =
    weekendAvg > 0 && weekdayAvg > 0 && weekendAvg / weekdayAvg >= 1.5;

  // Top category concentration.
  const sortedCats = Object.entries(currentByCat).sort(
    (a, b) => b[1] - a[1]
  );
  const topCat = sortedCats[0];
  const topShare =
    topCat && totalExpense > 0 ? topCat[1] / totalExpense : 0;

  // Savings rate.
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? net / totalIncome : 0;

  // 1) Negative net or strong over-pace → corrective tone.
  if (totalIncome > 0 && net < 0) {
    return {
      sentiment: 'negative',
      message: `Spending is ${fmtPeso(-net)} over income this month. Pause non-essentials and revisit your top category to close the gap.`,
    };
  }
  if (
    isCurrent &&
    trajectory.rolling3MoAvg > 0 &&
    trajectory.projected > trajectory.rolling3MoAvg * 1.15
  ) {
    const overshoot = trajectory.projected - trajectory.rolling3MoAvg;
    if (weekendHeavy && topCat) {
      return {
        sentiment: 'cautious',
        message: `On pace for ${fmtPeso(overshoot)} over your 3-mo average. Weekends in ${cap(topCat[0])} are driving it — try meal-prepping or a set weekend budget.`,
      };
    }
    return {
      sentiment: 'cautious',
      message: `Pacing ${fmtPeso(overshoot)} above your 3-mo average. Cut back on ${topCat ? cap(topCat[0]) : 'discretionary spend'} for a few days to reset.`,
    };
  }

  // 2) Concentration risk in a single category.
  if (topShare >= 0.45 && topCat && totalExpense > 0) {
    return {
      sentiment: 'cautious',
      message: `${cap(topCat[0])} is ${Math.round(topShare * 100)}% of your spend. A small cap on this category will free up the most cash.`,
    };
  }

  // 3) Strong positive savings rate.
  if (savingsRate >= 0.3) {
    return {
      sentiment: 'positive',
      message: `You're keeping ${Math.round(savingsRate * 100)}% of income (${fmtPeso(net)}). Consider moving the surplus to savings before month-end.`,
    };
  }
  if (savingsRate >= 0.15) {
    return {
      sentiment: 'positive',
      message: `Saving ${Math.round(savingsRate * 100)}% of income — solid. Bumping it to 20% would noticeably accelerate your goals.`,
    };
  }

  // 4) Pacing comfortably below baseline.
  if (
    isCurrent &&
    trajectory.rolling3MoAvg > 0 &&
    trajectory.projected < trajectory.rolling3MoAvg * 0.9
  ) {
    const saved = trajectory.rolling3MoAvg - trajectory.projected;
    return {
      sentiment: 'positive',
      message: `On track to spend ${fmtPeso(saved)} less than your 3-mo average — keep it going.`,
    };
  }

  // 5) Default: neutral nudge.
  if (topCat && totalExpense > 0) {
    return {
      sentiment: 'neutral',
      message: `${cap(topCat[0])} is your biggest line item this month. A 10% trim there is the simplest savings win.`,
    };
  }
  return {
    sentiment: 'neutral',
    message:
      'Steady month so far — log a few more transactions to sharpen Fino’s coaching.',
  };
}

/**
 * Habits: merchants visited ≥4 times in the month with an avg ticket under
 * ₱300. These are the "small but frequent" purchases worth surfacing for
 * their annualized impact.
 */
function recognizeHabits(
  merchantMap: Record<
    string,
    { total: number; count: number; category: string | null }
  >,
  daysElapsed: number,
  daysInMonth: number
): Habit[] {
  const monthScale = daysElapsed > 0 ? daysInMonth / daysElapsed : 1;
  const out: Habit[] = [];
  for (const [name, info] of Object.entries(merchantMap)) {
    if (info.count < 4) continue;
    const avg = info.total / info.count;
    if (avg > 300) continue;
    const monthlySpend = info.total * monthScale;
    out.push({
      merchant: name,
      category: info.category,
      visitsPerMonth: info.count * monthScale,
      avgAmount: avg,
      monthlySpend,
      annualized: monthlySpend * 12,
    });
  }
  return out.sort((a, b) => b.annualized - a.annualized).slice(0, 5);
}

function computeWeekDeltas(
  txns: TransactionModel[],
  now: Date
): WeekDelta[] {
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  const cutoffNow = now.getTime();
  const cutoffWeekAgo = cutoffNow - oneWeekMs;
  const cutoffTwoWeeksAgo = cutoffNow - 2 * oneWeekMs;

  const cur: Record<string, number> = {};
  const prev: Record<string, number> = {};
  for (const t of txns) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const ts = new Date(t.date).getTime();
    const cat = (t.category ?? '').trim().toLowerCase();
    if (!cat) continue;
    if (ts >= cutoffWeekAgo && ts <= cutoffNow) {
      cur[cat] = (cur[cat] ?? 0) + t.amount;
    } else if (ts >= cutoffTwoWeeksAgo && ts < cutoffWeekAgo) {
      prev[cat] = (prev[cat] ?? 0) + t.amount;
    }
  }

  const out: WeekDelta[] = [];
  for (const [cat, currentWeek] of Object.entries(cur)) {
    const prevWeek = prev[cat] ?? 0;
    if (prevWeek <= 0) continue;
    const pctChange = (currentWeek - prevWeek) / prevWeek;
    if (Math.abs(pctChange) < 0.2) continue;
    out.push({ category: cat, currentWeek, prevWeek, pctChange });
  }
  return out.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Full insight bundle for a given user/month — computed entirely from local
 * WatermelonDB data, no network calls. Safe to call from any screen on focus.
 */
export async function getInsights(
  userId: string,
  year: number,
  month: number
): Promise<Insights> {
  const monthStart = startOfMonthIso(year, month);
  const monthEnd = endOfMonthIso(year, month);
  const prior3MoStart = startOfMonthIso(year, month - 3);
  const prior3MoEnd = endOfMonthIso(year, month - 1);

  const txCol = database.get<TransactionModel>('transactions');
  const [monthTx, prior3MoTx] = await Promise.all([
    txCol
      .query(
        Q.where('user_id', userId),
        Q.where('date', Q.gte(monthStart)),
        Q.where('date', Q.lte(monthEnd))
      )
      .fetch(),
    txCol
      .query(
        Q.where('user_id', userId),
        Q.where('date', Q.gte(prior3MoStart)),
        Q.where('date', Q.lte(prior3MoEnd))
      )
      .fetch(),
  ]);

  // Month aggregates
  let totalIncome = 0;
  let totalExpense = 0;
  for (const t of monthTx) {
    if (isTransferRow(t)) continue;
    if (t.type === 'income') totalIncome += t.amount;
    else if (t.type === 'expense') totalExpense += t.amount;
  }
  const currentByCat = sumExpensesByCategory(monthTx);
  const merchantMap = sumByMerchant(monthTx);

  // Prior 3-month aggregates. We track both the per-month sums (used for the
  // rolling 3-mo baseline) and the explicit month keys (used by the anomaly
  // detector so zero-spend months become 0 observations, not missing data).
  let prior3MoTotal = 0;
  const prior3MoMonthsSeen = new Set<string>();
  for (const t of prior3MoTx) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    prior3MoTotal += t.amount;
    prior3MoMonthsSeen.add(t.date.slice(0, 7));
  }
  const prior3MoMonthsCount = prior3MoMonthsSeen.size || 1;
  // Build the canonical list of prior month keys (3 entries, most recent
  // last). We materialise empty months as well so MAD has a fixed-length
  // baseline (see §3.6 of INSIGHTS_FORMULAS.md).
  const priorMonthKeys: string[] = [];
  for (let i = 3; i >= 1; i--) {
    const dt = new Date(year, month - i, 1);
    priorMonthKeys.push(
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    );
  }

  // Date math
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCurrent =
    today.getFullYear() === year && today.getMonth() === month;
  const daysElapsed = isCurrent ? today.getDate() : daysInMonth;

  // Per-day expense totals for the elapsed days of the current month.
  // Treated as i.i.d. draws by the trajectory CI calculation. We bucket by
  // calendar day so multiple transactions on the same day collapse into a
  // single daily total (the unit of analysis).
  const dailyTotalsByDay: Record<number, number> = {};
  for (const t of monthTx) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const day = new Date(t.date).getDate();
    if (day > daysElapsed) continue;
    dailyTotalsByDay[day] = (dailyTotalsByDay[day] ?? 0) + t.amount;
  }
  const elapsedDailyTotals: number[] = [];
  for (let d = 1; d <= daysElapsed; d++) {
    elapsedDailyTotals.push(dailyTotalsByDay[d] ?? 0);
  }

  // Run detectors
  const anomalies = detectAnomalies(currentByCat, prior3MoTx, priorMonthKeys);
  const trajectory = forecastTrajectory(
    totalExpense,
    daysElapsed,
    daysInMonth,
    prior3MoTotal,
    prior3MoMonthsCount,
    { year, month, priorTxns: prior3MoTx, elapsedDailyTotals }
  );
  const habits = recognizeHabits(merchantMap, daysElapsed, daysInMonth);
  const weekDeltas = isCurrent ? computeWeekDeltas(monthTx, today) : [];
  const recurring = detectRecurring(prior3MoTx, today);
  const coach = buildCoachMessage({
    totalIncome,
    totalExpense,
    trajectory,
    currentByCat,
    monthTx,
    isCurrent,
  });

  // ── 6-month net trend (slope + R² via OLS) ───────────────────────────
  //
  // Build the 6-month net series and fit a line. We drop months with no
  // activity at all (totalTx = 0) before fitting — a string of "0" months
  // from before the user signed up shouldn't be fitted against. See §3.14
  // of INSIGHTS_FORMULAS.md.
  const sixMoStart = startOfMonthIso(year, month - 5);
  const sixMoTx = await txCol
    .query(
      Q.where('user_id', userId),
      Q.where('date', Q.gte(sixMoStart)),
      Q.where('date', Q.lte(monthEnd))
    )
    .fetch();
  const sixMoNetByMonth: Record<string, { net: number; txCount: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(year, month - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    sixMoNetByMonth[key] = { net: 0, txCount: 0 };
  }
  for (const t of sixMoTx) {
    if (isTransferRow(t)) continue;
    const key = t.date.slice(0, 7);
    if (!(key in sixMoNetByMonth)) continue;
    const slot = sixMoNetByMonth[key];
    if (t.type === 'income') slot.net += t.amount;
    else if (t.type === 'expense') slot.net -= t.amount;
    slot.txCount += 1;
  }
  const trendPoints: number[] = [];
  for (const key of Object.keys(sixMoNetByMonth)) {
    const slot = sixMoNetByMonth[key];
    if (slot.txCount > 0) trendPoints.push(slot.net);
  }
  let trendSlope: TrendSlope | null = null;
  if (trendPoints.length >= 3) {
    const reg = linearRegression(trendPoints);
    // R² ≥ 0.6 is our threshold for asserting a direction — below this the
    // fit isn't strong enough to call the slope (§3.14).
    let direction: TrendSlope['direction'] = 'flat';
    if (reg.r2 >= 0.6 && reg.slope > 0) direction = 'up';
    else if (reg.r2 >= 0.6 && reg.slope < 0) direction = 'down';
    trendSlope = {
      slope: reg.slope,
      r2: reg.r2,
      n: reg.n,
      direction,
    };
  }

  // ── Sufficiency verdicts ────────────────────────────────────────────
  //
  // These drive the "needs more data" overlays on individual cards. Each
  // gate is defined in @/utils/sufficiency and documented in §1.2 of
  // INSIGHTS_FORMULAS.md.
  const expenseTxCount = monthTx.reduce(
    (acc, t) =>
      acc +
      (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense' ? 0 : 1),
    0
  );
  const populatedWeekdays = countPopulatedWeekdays(monthTx);
  const populatedTodBuckets = countPopulatedTodBuckets(monthTx);
  const sufficiency: InsightsSufficiency = {
    sankey: checkSankey({
      hasIncome: totalIncome > 0,
      hasExpense: totalExpense > 0,
    }),
    trajectory: checkTrajectory({
      txCount: expenseTxCount,
      daysElapsed,
    }),
    composition: checkComposition({
      expenseTxCount,
      categoryCount: Object.keys(currentByCat).length,
    }),
    dowPattern: checkDowPattern({
      txCount: expenseTxCount,
      populatedWeekdays,
    }),
    todPattern: checkTodPattern({
      txCount: expenseTxCount,
      populatedBuckets: populatedTodBuckets,
    }),
    trendSlope: checkTrendSlope({ monthsWithData: trendPoints.length }),
  };

  // ── Build chip strings ─────────────────────────────────────────────
  const headline = composeHeadline({
    totalIncome,
    totalExpense,
    trajectory,
    anomalies,
    coach,
    trendSlope,
  });
  const whereChip = composeWhereChip({
    currentByCat,
    weekDeltas,
    anomalies,
    totalExpense,
  });
  const whenChip = composeWhenChip({ trajectory, monthTx, isCurrent });

  return {
    headline,
    whereChip,
    whenChip,
    anomalies,
    trajectory: isCurrent ? trajectory : null,
    habits,
    weekDeltas,
    recurring,
    coach,
    trendSlope,
    sufficiency,
  };
}

/**
 * Count distinct weekdays (Mon–Sun) on which the user logged at least one
 * expense in the current month. Used by the DoW sufficiency gate — the
 * "peak day" claim becomes hollow when 4+ weekdays sit empty.
 */
function countPopulatedWeekdays(txns: TransactionModel[]): number {
  const seen = new Set<number>();
  for (const t of txns) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const dow = (new Date(t.date).getDay() + 6) % 7;
    seen.add(dow);
  }
  return seen.size;
}

/**
 * Count distinct time-of-day buckets (morning/afternoon/evening/night) on
 * which the user logged at least one expense in the current month. Used by
 * the TOD sufficiency gate.
 *
 * Bucket boundaries match the chart in StatsScreen:
 *   morning 5–12, afternoon 12–17, evening 17–21, night otherwise.
 */
function countPopulatedTodBuckets(txns: TransactionModel[]): number {
  const seen = new Set<number>();
  for (const t of txns) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const hr = new Date(t.date).getHours();
    const idx =
      hr >= 5 && hr < 12 ? 0 : hr >= 12 && hr < 17 ? 1 : hr >= 17 && hr < 21 ? 2 : 3;
    seen.add(idx);
  }
  return seen.size;
}

/**
 * A "% above median" reading is only meaningful against a material baseline;
 * against a near-zero median (e.g. ₱50) it explodes into noise ("6283% above").
 * A tiny baseline or an extreme ratio is a "runaway" — narrate the absolute
 * pesos instead of the percentage. (The anomaly itself is still real; only its
 * framing changes.)
 */
function anomalyRunaway(a: Anomaly): boolean {
  return a.baseline < 500 || a.pctOver > 3;
}

function composeHeadline(args: {
  totalIncome: number;
  totalExpense: number;
  trajectory: TrajectoryForecast;
  anomalies: Anomaly[];
  coach: CoachMessage;
  trendSlope: TrendSlope | null;
}): string {
  const { totalIncome, totalExpense, trajectory, anomalies, coach, trendSlope } =
    args;
  if (totalIncome === 0 && totalExpense === 0) {
    return 'No transactions yet this month — start tracking to see your trends.';
  }
  // Anomalies are the loudest signal — surface them first. The chip uses the
  // robust z-score above 3.5 (see §3.6 of INSIGHTS_FORMULAS.md), so a flagged
  // category is genuinely out of band, not just "above the mean".
  if (anomalies.length > 0) {
    const top = anomalies[0];
    if (anomalyRunaway(top)) {
      return `Heads up — you've spent ${fmtPeso(top.current)} on ${cap(top.category)} this month, well above your usual ${fmtPeso(top.baseline)}.`;
    }
    return `Heads up — ${cap(top.category)} is ${(top.pctOver * 100).toFixed(0)}% above your 3-mo median (${fmtPeso(top.current)} vs ${fmtPeso(top.baseline)}).`;
  }
  // Negative-sentiment coach overrides everything else (overspend, etc.).
  if (coach.sentiment === 'negative') {
    return coach.message;
  }
  if (totalIncome <= 0) {
    return `You've spent ${fmtPeso(totalExpense)} so far. Add an income transaction to see your savings rate.`;
  }
  const net = totalIncome - totalExpense;
  const pct = Math.round((net / totalIncome) * 100);
  if (trajectory.rolling3MoAvg > 0) {
    const diff = trajectory.projected - trajectory.rolling3MoAvg;
    if (Math.abs(diff) > trajectory.rolling3MoAvg * 0.15) {
      const paceLabel = trajectory.usedDowWeighting
        ? 'On pace (weighted by your weekday rhythm)'
        : 'On pace';
      return diff > 0
        ? `${paceLabel} to spend ${fmtPeso(diff)} more than your 3-mo average. Saving ${pct}% of income.`
        : `${paceLabel} to spend ${fmtPeso(-diff)} less than your 3-mo average — keep it going.`;
    }
  }
  // Defer to the coach for cautious/positive nuance when no other signal fires.
  if (coach.sentiment === 'cautious' || coach.sentiment === 'positive') {
    return coach.message;
  }
  // OLS trend over the last 6 months — only surface a direction when the fit
  // is strong (R² ≥ 0.6, enforced in TrendSlope.direction). Otherwise the
  // slope is just connecting two noisy endpoints.
  if (trendSlope && trendSlope.direction !== 'flat') {
    const monthlyMove = Math.abs(trendSlope.slope);
    if (trendSlope.direction === 'up') {
      return `Net is trending up ${fmtPeso(monthlyMove)}/month over the last 6 months (R²=${trendSlope.r2.toFixed(2)}). Keeping ${pct}% of income.`;
    }
    return `Net is trending down ${fmtPeso(monthlyMove)}/month over the last 6 months (R²=${trendSlope.r2.toFixed(2)}). Review your top categories below.`;
  }
  if (pct >= 30) {
    return `Strong month — keeping ${pct}% of income (${fmtPeso(net)}).`;
  }
  if (pct >= 0) {
    return `Keeping ${pct}% of income this month. Net ${fmtPeso(net)}.`;
  }
  return `Spending is ${fmtPeso(-net)} above income this month — review your top categories below.`;
}

function composeWhereChip(args: {
  currentByCat: Record<string, number>;
  weekDeltas: WeekDelta[];
  anomalies: Anomaly[];
  totalExpense: number;
}): string {
  const { currentByCat, weekDeltas, anomalies, totalExpense } = args;
  // Strongest signal: anomaly vs 3-mo baseline.
  if (anomalies[0]) {
    const a = anomalies[0];
    if (anomalyRunaway(a)) {
      return `${cap(a.category)} is ${fmtPeso(a.current)} this month vs your usual ${fmtPeso(a.baseline)}.`;
    }
    return `${cap(a.category)} is up ${(a.pctOver * 100).toFixed(0)}% vs your 3-mo average — ${fmtPeso(a.current)} this month.`;
  }
  // Week-over-week delta is more conversational than a static category share.
  if (weekDeltas[0]) {
    const w = weekDeltas[0];
    const dir = w.pctChange > 0 ? 'more' : 'less';
    return `You've spent ${(Math.abs(w.pctChange) * 100).toFixed(0)}% ${dir} on ${cap(w.category)} this week vs last week.`;
  }
  // Fall back to category concentration.
  const sorted = Object.entries(currentByCat).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top || totalExpense <= 0) {
    return 'No expenses tracked yet — your top categories will appear here.';
  }
  const pct = Math.round((top[1] / totalExpense) * 100);
  return `${cap(top[0])} is your biggest category at ${pct}% of spend (${fmtPeso(top[1])}).`;
}

function composeWhenChip(args: {
  trajectory: TrajectoryForecast;
  monthTx: TransactionModel[];
  isCurrent: boolean;
}): string {
  const { trajectory, monthTx, isCurrent } = args;
  // Day-of-week totals AND time-of-day totals. We run a chi² goodness-of-fit
  // test against the uniform null on each — see §3.9 / §3.10 of
  // INSIGHTS_FORMULAS.md. The "peak day" / "peak window" claim is only made
  // when the test is significant at α = 0.05 AND the expected count per
  // bucket is ≥5 (NIST validity floor).
  const dowTotals = [0, 0, 0, 0, 0, 0, 0];
  const dowCounts = [0, 0, 0, 0, 0, 0, 0];
  const todTotals = [0, 0, 0, 0];
  for (const t of monthTx) {
    if (isTransferRow(t) || isAdjustmentRow(t) || t.type !== 'expense') continue;
    const date = new Date(t.date);
    const dow = (date.getDay() + 6) % 7;
    dowTotals[dow] += t.amount;
    dowCounts[dow] += 1;
    const hr = date.getHours();
    const idx =
      hr >= 5 && hr < 12 ? 0 : hr >= 12 && hr < 17 ? 1 : hr >= 17 && hr < 21 ? 2 : 3;
    todTotals[idx] += t.amount;
  }
  const dowAvg = dowTotals.map((sum, i) =>
    dowCounts[i] > 0 ? sum / dowCounts[i] : 0
  );
  const peakIdx = dowAvg.reduce(
    (best, v, i) => (v > dowAvg[best] ? i : best),
    0
  );
  const peakValue = dowAvg[peakIdx];
  const dayLabels = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

  // Trajectory-aware framing when in the current month and we have a baseline.
  if (
    isCurrent &&
    trajectory.daysElapsed > 0 &&
    trajectory.rolling3MoAvg > 0
  ) {
    const diff = trajectory.projected - trajectory.rolling3MoAvg;
    if (Math.abs(diff) > trajectory.rolling3MoAvg * 0.1) {
      return diff > 0
        ? `Pacing ${fmtPeso(diff)} above your 3-mo average — ${trajectory.daysRemaining} days left to course-correct.`
        : `Pacing ${fmtPeso(-diff)} below your 3-mo average — on track for a quieter month.`;
    }
  }
  if (!peakValue) {
    return 'Need a few days of activity before patterns show up.';
  }
  // Significance test: if the DoW distribution isn't distinguishable from
  // uniform, we refuse to crown a peak day. The threshold for the test
  // statistic χ² with df=6 at α=0.05 is 12.59 (see chi2Critical95(6)).
  const dowTest = chi2Uniform(dowTotals);
  if (!dowTest.significant) {
    // Fall back to TOD if that pattern is significant — same test, df=3,
    // critical 7.81. Both insignificant → soften the claim.
    const todTest = chi2Uniform(todTotals);
    if (todTest.significant) {
      const todLabels = ['mornings', 'afternoons', 'evenings', 'nights'];
      const peakTod = todTotals.reduce(
        (best, v, i) => (v > todTotals[best] ? i : best),
        0
      );
      const todTotal = todTotals.reduce((s, v) => s + v, 0);
      const share = Math.round((todTotals[peakTod] / todTotal) * 100);
      return `Spend skews ${todLabels[peakTod]} — ${share}% of this month lands in that window.`;
    }
    return 'Spending is spread fairly evenly across the week so far.';
  }
  return `${dayLabels[peakIdx]} top your spending at ${fmtPeso(peakValue)} on average.`;
}

// ─── Category suggestion ────────────────────────────────────────────────────

/**
 * Suggests a category for a free-text merchant/description. Tries:
 *   1. **History match** — exact or substring match against past
 *      `merchant_name` / `display_name`. Picks the most-frequent category.
 *   2. **Keyword fallback** — the static `aiCategoryMap` dictionary (only
 *      meaningful for `type: 'expense'`; income callers should skip it).
 *
 * `availableCategories` is the user's category list; the engine restricts
 * its suggestions to names that exist in this list (case-insensitive).
 * `type` scopes both the history match and the keyword fallback — passing
 * 'income' filters history to past income transactions and disables the
 * expense-only taxonomy lookup so an income tx never gets tagged 'Food'.
 *
 * Cheap (one DB read with a `like` filter) and fully offline.
 */
export async function suggestCategory(
  userId: string,
  text: string,
  availableCategories: string[],
  type: 'expense' | 'income' = 'expense'
): Promise<CategorySuggestion> {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) {
    return { category: '', confidence: 'low', source: 'none' };
  }

  const allowedSet = new Set(
    availableCategories.map((c) => c.toLowerCase())
  );
  const findInAllowed = (name: string | null | undefined): string | null => {
    if (!name) return null;
    const idx = availableCategories.findIndex(
      (c) => c.toLowerCase() === name.toLowerCase()
    );
    return idx >= 0 ? availableCategories[idx] : null;
  };

  // 1) History match — pull recent same-type txs whose merchant/display matches.
  try {
    const txCol = database.get<TransactionModel>('transactions');
    const hits = await txCol
      .query(
        Q.where('user_id', userId),
        Q.where('type', type),
        Q.or(
          Q.where('merchant_name', Q.like(`%${Q.sanitizeLikeString(trimmed)}%`)),
          Q.where('display_name', Q.like(`%${Q.sanitizeLikeString(trimmed)}%`))
        ),
        Q.sortBy('date', Q.desc),
        Q.take(50)
      )
      .fetch();

    if (hits.length > 0) {
      const counts: Record<string, number> = {};
      for (const t of hits) {
        const cat = (t.category ?? '').trim();
        if (!cat || !allowedSet.has(cat.toLowerCase())) continue;
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const top = ranked[0];
      if (top) {
        const matched = findInAllowed(top[0]);
        if (matched) {
          // High confidence when the leading category covers ≥60% of hits
          // AND we have at least 3 hits to back it up.
          const total = ranked.reduce((s, [, c]) => s + c, 0);
          const dominance = top[1] / total;
          const confidence: CategorySuggestion['confidence'] =
            top[1] >= 3 && dominance >= 0.6 ? 'high' : 'medium';
          return { category: matched, confidence, source: 'history' };
        }
      }
    }
  } catch {
    // Swallow DB errors — keyword fallback below still works.
  }

  // 2) Keyword fallback via static taxonomy.
  //    The taxonomy is expense-only (food / transport / bills / health / …),
  //    so for income transactions we stop after the history step rather than
  //    risk tagging "client payment" with an expense category.
  if (type === 'income') {
    return { category: '', confidence: 'low', source: 'none' };
  }
  //    Pass `availableCategories` so the analyzer's bubble-up resolver can
  //    return the most-specific match against the user's category list
  //    (e.g. "starbucks" → "Coffee" if they have it, else "Food").
  const keyword = analyzeTransactionText(trimmed, availableCategories);
  if (keyword.resolvedCategory) {
    const matched = findInAllowed(keyword.resolvedCategory);
    if (matched) {
      return { category: matched, confidence: 'high', source: 'keyword' };
    }
  }
  if (keyword.suggestedCategory) {
    const matched = findInAllowed(keyword.suggestedCategory);
    if (matched) {
      return { category: matched, confidence: 'high', source: 'keyword' };
    }
    // Keyword resolved a category key but the user doesn't have a matching
    // category by that exact name — return as low-confidence raw guess so
    // callers can decide whether to display it.
    return {
      category: keyword.suggestedCategory,
      confidence: 'low',
      source: 'keyword',
    };
  }

  return { category: '', confidence: 'low', source: 'none' };
}

export default {
  getInsights,
  suggestCategory,
};
