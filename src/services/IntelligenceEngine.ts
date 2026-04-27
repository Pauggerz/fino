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
import { analyzeTransactionText } from './aiCategoryMap';
import fmtPeso from '@/utils/format';

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

function sumExpensesByCategory(txns: TransactionModel[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (isTransferRow(t) || t.type !== 'expense') continue;
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
    if (isTransferRow(t) || t.type !== 'expense') continue;
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
 * Anomalies: categories whose current-month spend is ≥50% above their
 * 3-month rolling average (excluding the current month). Only categories
 * with a baseline of at least one prior month with non-zero spend qualify
 * — avoids false-positives on first-time categories.
 */
function detectAnomalies(
  currentByCat: Record<string, number>,
  prior3MoByCat: Record<string, number>,
  prior3MoMonthsCount: number
): Anomaly[] {
  const out: Anomaly[] = [];
  for (const [cat, current] of Object.entries(currentByCat)) {
    const total3Mo = prior3MoByCat[cat] ?? 0;
    if (total3Mo <= 0) continue;
    const baseline = total3Mo / Math.max(1, prior3MoMonthsCount);
    if (baseline <= 0 || current <= baseline * 1.5) continue;
    out.push({
      category: cat,
      current,
      baseline,
      pctOver: (current - baseline) / baseline,
    });
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
    if (isTransferRow(t) || t.type !== 'expense') continue;
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

  return {
    projected,
    spent: monthSpent,
    dailyAvg,
    daysElapsed,
    daysRemaining: Math.max(0, daysInMonth - daysElapsed),
    rolling3MoAvg,
    pacingOver: rolling3MoAvg > 0 && projected > rolling3MoAvg,
    usedDowWeighting,
  };
}

// ─── Recurring bill detection ───────────────────────────────────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[m - 1] + sorted[m]) / 2
    : sorted[m];
}

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
    if (isTransferRow(t) || t.type !== 'expense') continue;
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
    if (isTransferRow(t) || t.type !== 'expense') continue;
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
    if (isTransferRow(t) || t.type !== 'expense') continue;
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

  // Prior 3-month aggregates
  const prior3MoByCat: Record<string, number> = {};
  let prior3MoTotal = 0;
  const prior3MoMonthsSeen = new Set<string>();
  for (const t of prior3MoTx) {
    if (isTransferRow(t) || t.type !== 'expense') continue;
    const cat = (t.category ?? '').trim().toLowerCase();
    if (cat) prior3MoByCat[cat] = (prior3MoByCat[cat] ?? 0) + t.amount;
    prior3MoTotal += t.amount;
    prior3MoMonthsSeen.add(t.date.slice(0, 7));
  }
  const prior3MoMonthsCount = prior3MoMonthsSeen.size || 1;

  // Date math
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCurrent =
    today.getFullYear() === year && today.getMonth() === month;
  const daysElapsed = isCurrent ? today.getDate() : daysInMonth;

  // Run detectors
  const anomalies = detectAnomalies(
    currentByCat,
    prior3MoByCat,
    prior3MoMonthsCount
  );
  const trajectory = forecastTrajectory(
    totalExpense,
    daysElapsed,
    daysInMonth,
    prior3MoTotal,
    prior3MoMonthsCount,
    { year, month, priorTxns: prior3MoTx }
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

  // ── Build chip strings ─────────────────────────────────────────────
  const headline = composeHeadline({
    totalIncome,
    totalExpense,
    trajectory,
    anomalies,
    coach,
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
  };
}

function composeHeadline(args: {
  totalIncome: number;
  totalExpense: number;
  trajectory: TrajectoryForecast;
  anomalies: Anomaly[];
  coach: CoachMessage;
}): string {
  const { totalIncome, totalExpense, trajectory, anomalies, coach } = args;
  if (totalIncome === 0 && totalExpense === 0) {
    return 'No transactions yet this month — start tracking to see your trends.';
  }
  // Anomalies are the loudest signal — surface them first.
  if (anomalies.length > 0) {
    const top = anomalies[0];
    return `Heads up — ${cap(top.category)} is ${(top.pctOver * 100).toFixed(0)}% above your 3-mo average (${fmtPeso(top.current)} vs ${fmtPeso(top.baseline)}).`;
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
  // Day-of-week peak (kept from the original chip — still the most useful
  // "when" signal when no anomalies fire).
  const dowTotals = [0, 0, 0, 0, 0, 0, 0];
  const dowCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const t of monthTx) {
    if (isTransferRow(t) || t.type !== 'expense') continue;
    const dow = (new Date(t.date).getDay() + 6) % 7;
    dowTotals[dow] += t.amount;
    dowCounts[dow] += 1;
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
  return `${dayLabels[peakIdx]} top your spending at ${fmtPeso(peakValue)} on average.`;
}

// ─── Category suggestion ────────────────────────────────────────────────────

/**
 * Suggests a category for a free-text merchant/description. Tries:
 *   1. **History match** — exact or substring match against past
 *      `merchant_name` / `display_name`. Picks the most-frequent category.
 *   2. **Keyword fallback** — the static `aiCategoryMap` dictionary.
 *
 * `availableCategories` is the user's category list; the engine restricts
 * its suggestions to names that exist in this list (case-insensitive).
 *
 * Cheap (one DB read with a `like` filter) and fully offline.
 */
export async function suggestCategory(
  userId: string,
  text: string,
  availableCategories: string[]
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

  // 1) History match — pull recent expenses whose merchant/display matches.
  try {
    const txCol = database.get<TransactionModel>('transactions');
    const hits = await txCol
      .query(
        Q.where('user_id', userId),
        Q.where('type', 'expense'),
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

  // 2) Keyword fallback via static dictionary.
  const keyword = analyzeTransactionText(trimmed);
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
