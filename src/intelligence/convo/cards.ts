/**
 * Pure card builders (FINO_CHATBOT_CARDS.md §3). Each turns the live
 * `BrainContext` / `Insights` into a fully-populated, theme-free card payload.
 * Shared by the reactive answers (`intelligenceBridge`) and the proactive
 * opening coach card (`coach.ts`).
 *
 * No theme, no DB, no async — the brain stays pure & synchronous. `Insights` is
 * imported type-only so the `tsx` harness never eval-loads the engine.
 */

import type {
  Insights,
  Anomaly,
  Sentiment,
} from '../../services/IntelligenceEngine';
import type {
  BrainContext,
  BreakdownCard,
  CompareCard,
  ForecastCard,
  CoachCard,
  CoachReason,
  CardStatus,
  DeltaDirection,
  TxLite,
  TxListCard,
  TxListRow,
  StatusCard,
  SummaryCard,
  BudgetCard,
  BudgetRow,
  NeedsWantsCard,
  PatternCard,
  PatternBar,
} from './types';
import { peso, pctOf } from './nlg';

const MAX_SEGMENTS = 4;
const MAX_COACH_REASONS = 3;

function dirOf(diff: number): DeltaDirection {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'flat';
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Sentiment → status role: negative → over, cautious → watch, else good. */
export function sentimentToStatus(s: Sentiment): CardStatus {
  if (s === 'negative') return 'over';
  if (s === 'cautious') return 'watch';
  return 'good';
}

function coachTitle(status: CardStatus): string {
  if (status === 'over') return 'Heads up';
  if (status === 'watch') return 'A small watch-out';
  return 'Looking good';
}

function anomalyReason(a: Anomaly): CoachReason {
  return {
    label: cap(a.category),
    detail: `${peso(a.current)} vs ${peso(a.baseline)} usual`,
    bar: {
      value: a.current,
      limit: a.baseline,
      status: a.pctOver >= 0.5 ? 'over' : 'watch',
    },
  };
}

// ─── Breakdown / compare (aggregates only) ───────────────────────────────────

export function buildBreakdownCard(ctx: BrainContext): BreakdownCard | null {
  if (!ctx.topCategories.length) return null;
  const segments = ctx.topCategories
    .slice(0, MAX_SEGMENTS)
    .map((c, i) => ({ label: c.name, amount: c.amount, role: `cat-${i}` }));

  let delta: BreakdownCard['delta'];
  if (ctx.lastMonthSpent > 0) {
    const diff = ctx.spent - ctx.lastMonthSpent;
    delta = {
      current: ctx.spent,
      previous: ctx.lastMonthSpent,
      pct: pctOf(Math.abs(diff), ctx.lastMonthSpent),
      direction: dirOf(diff),
    };
  }
  return { total: ctx.spent, segments, delta };
}

export function buildCompareCard(ctx: BrainContext): CompareCard | null {
  if (ctx.lastMonthSpent <= 0) return null;
  const diff = ctx.spent - ctx.lastMonthSpent;
  return {
    currentLabel: 'This month',
    previousLabel: 'Last month',
    current: ctx.spent,
    previous: ctx.lastMonthSpent,
    pct: pctOf(Math.abs(diff), ctx.lastMonthSpent),
    direction: dirOf(diff),
  };
}

// ─── Forecast (needs trajectory; honors the sufficiency gate) ────────────────

export function buildForecastCard(ctx: BrainContext): ForecastCard | null {
  const ins = ctx.insights;
  const tr = ins?.trajectory;
  // No forecast card below the trajectory gate — exactly like the Insights
  // overlay (FINO_CHATBOT_CARDS.md §9 thin-data risk).
  if (!ins || !tr || !ins.sufficiency.trajectory.ok) return null;

  let status: CardStatus = 'good';
  if (ctx.income > 0 && tr.projected >= ctx.income) status = 'over';
  else if (tr.pacingOver) status = 'watch';

  return {
    spent: tr.spent,
    projected: tr.projected,
    income: ctx.income > 0 ? ctx.income : undefined,
    ciLow: tr.ciLow,
    ciHigh: tr.ciHigh,
    daysElapsed: tr.daysElapsed,
    daysInMonth: tr.daysElapsed + tr.daysRemaining,
    status,
  };
}

// ─── Coach (flexible advisory; reactive + proactive + push share this) ───────

/**
 * Build the coach card from computed Insights. `focusCategory` (from an
 * overspend question's category slot) prioritises that category's anomaly.
 */
export function buildCoachCard(
  ins: Insights,
  opts: { focusCategory?: string; maxReasons?: number } = {}
): CoachCard {
  const status = sentimentToStatus(ins.coach.sentiment);
  const reasonCap = Math.max(1, opts.maxReasons ?? MAX_COACH_REASONS);

  const ranked = [...ins.anomalies].sort((a, b) => b.pctOver - a.pctOver);
  let chosen = ranked;
  if (opts.focusCategory) {
    const focus = opts.focusCategory.toLowerCase();
    const match = ranked.filter((a) => a.category.toLowerCase() === focus);
    if (match.length) chosen = match;
  }

  const reasons: CoachReason[] = chosen.slice(0, reasonCap).map(anomalyReason);

  // No anomaly to show but a bill is imminent → surface that instead.
  if (reasons.length === 0 && ins.recurring.length > 0) {
    const soonest = [...ins.recurring]
      .filter((r) => r.daysUntilNext != null && r.daysUntilNext >= 0)
      .sort((a, b) => (a.daysUntilNext ?? 0) - (b.daysUntilNext ?? 0))[0];
    if (soonest) {
      const days = soonest.daysUntilNext ?? 0;
      reasons.push({
        label: cap(soonest.merchant),
        detail: `${peso(soonest.amount)} due ${
          days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`
        }`,
      });
    }
  }

  return {
    status,
    title: coachTitle(status),
    message: ins.coach.message,
    reasons: reasons.length ? reasons : undefined,
  };
}

// ─── Transaction list + status (V3, Category 1) ──────────────────────────────

/** Best human label for a transaction row. */
function txLabel(t: TxLite): string {
  return (
    t.name?.trim() || t.merchant?.trim() || t.category?.trim() || 'Transaction'
  );
}

/** Map a `TxLite` to a renderable `TxListRow` (tappable → TransactionDetail). */
export function buildTxRow(t: TxLite): TxListRow {
  return {
    id: t.id,
    name: txLabel(t),
    category: t.category,
    amount: t.amount,
    type: t.type,
    date: t.date,
  };
}

/**
 * Build a transaction-list card from an already-selected, already-sorted set of
 * rows. The bridge does the filtering/sorting/slicing; this just maps + frames.
 * `total` is the sum of the FULL match set (pre-slice); `matchCount` its size.
 */
export function buildTxListCard(
  title: string,
  rows: TxLite[],
  opts: { total?: number; matchCount?: number } = {}
): TxListCard {
  return {
    title,
    rows: rows.map(buildTxRow),
    total: opts.total,
    matchCount: opts.matchCount,
  };
}

/** Build a yes/no status card, optionally carrying the matched transaction. */
export function buildStatusCard(args: {
  yes: boolean;
  status: CardStatus;
  title: string;
  message: string;
  tx?: TxLite;
}): StatusCard {
  return {
    yes: args.yes,
    status: args.status,
    title: args.title,
    message: args.message,
    tx: args.tx ? buildTxRow(args.tx) : undefined,
  };
}

// ─── Summary / budget / needs-wants / pattern (V3, Categories 2 & 3) ──────────

const MAX_SUMMARY_SEGMENTS = 4;

/** Build a range-scoped summary card from already-aggregated in/out + top cats. */
export function buildSummaryCard(args: {
  label: string;
  income: number;
  expense: number;
  segments: { name: string; amount: number }[];
}): SummaryCard {
  const net = args.income - args.expense;
  return {
    label: args.label,
    income: args.income,
    expense: args.expense,
    net,
    savingsRate: args.income > 0 ? net / args.income : undefined,
    segments: args.segments
      .slice(0, MAX_SUMMARY_SEGMENTS)
      .map((c, i) => ({ label: c.name, amount: c.amount, role: `cat-${i}` })),
  };
}

/** Spent-vs-limit verdict. `over` once exceeded; `watch` when near the cap or
 *  the spend pace is outrunning the elapsed month; else `good`. */
export function budgetRowStatus(
  spent: number,
  limit: number,
  monthProgress?: number
): CardStatus {
  if (limit <= 0) return 'watch';
  const used = spent / limit;
  if (used > 1) return 'over';
  if (used >= 0.9) return 'watch';
  if (
    monthProgress != null &&
    monthProgress > 0 &&
    used > monthProgress + 0.1
  ) {
    return 'watch';
  }
  return 'good';
}

/** Build a budget-health card from per-category spent + limit pairs. */
export function buildBudgetCard(
  rows: { label: string; spent: number; limit: number }[],
  monthProgress?: number
): BudgetCard {
  const built: BudgetRow[] = rows.map((r) => ({
    label: r.label,
    spent: r.spent,
    limit: r.limit,
    status: budgetRowStatus(r.spent, r.limit, monthProgress),
  }));
  // Worst first (over → watch → good), then by how full the bar is.
  const rank: Record<CardStatus, number> = { over: 0, watch: 1, good: 2 };
  built.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.spent / Math.max(1, b.limit) - a.spent / Math.max(1, a.limit)
  );
  return { rows: built, monthProgress };
}

/** Build a needs-vs-wants card from the heuristic split. */
export function buildNeedsWantsCard(split: {
  need: number;
  want: number;
  unknown?: number;
}): NeedsWantsCard {
  const total = split.need + split.want;
  return {
    need: split.need,
    want: split.want,
    needPct: total > 0 ? split.need / total : 0,
    unknown: split.unknown && split.unknown > 0 ? split.unknown : undefined,
  };
}

/** Build a pattern card (day-of-week bars or a short trend series). */
export function buildPatternCard(args: {
  title: string;
  caption: string;
  bars: PatternBar[];
  direction?: DeltaDirection;
}): PatternCard {
  return {
    title: args.title,
    caption: args.caption,
    bars: args.bars,
    direction: args.direction,
  };
}
