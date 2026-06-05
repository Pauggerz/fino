/**
 * Public contract for the Convo brain. These types are what the ChatScreen
 * threads in and renders out; they are re-exported from `convo/brain.ts` via
 * the `@/intelligence` barrel.
 *
 * The base `BrainResponse`/`BrainContext` were kept identical to the original
 * finoBrain types so swapping the engine was a no-op for callers
 * (FINO_INTELLIGENCE_V2.md §7). FINO_CHATBOT_CARDS.md then adds the optional
 * `card` payload to `BrainResponse` and the optional `insights` to
 * `BrainContext` — both additive and back-compatible.
 *
 * NOTE: `Insights` is imported **type-only** so the `tsx` brain harness never
 * eval-loads `IntelligenceEngine` (which pulls in WatermelonDB / React Native).
 * The brain reads `ctx.insights` as plain data; it never imports the engine at
 * runtime, keeping the pipeline pure & synchronous.
 */

import type { Insights } from '../../services/IntelligenceEngine';

// ─── Card contract (FINO_CHATBOT_CARDS.md §3) ────────────────────────────────

/**
 * Semantic status role. The brain has no theme, so it emits a role and
 * `ChatCardView` (which has `useTheme()`) maps it to a token (§3.1):
 *   good → positive · watch → amber · over → negative.
 */
export type CardStatus = 'good' | 'watch' | 'over';

/** Direction of a period-over-period change. */
export type DeltaDirection = 'up' | 'down' | 'flat';

/**
 * Optional single deep-link chip on a card (§10 Q4). The renderer maps `target`
 * to the existing Stats navigation; the brain never holds a navigator.
 */
export type CardAction = { label: string; target: 'insights' };

/** One slice of a breakdown. `role` is a palette index ('cat-0' | 'cat-1' | …),
 *  never a color — `ChatCardView` resolves it against the theme palette. */
export type BreakdownSegment = {
  label: string;
  amount: number;
  role: string;
};

export type BreakdownCard = {
  /** Total spend the segments sum toward (may exceed Σ segments when truncated). */
  total: number;
  /** Top categories, already sorted high → low and capped by the builder. */
  segments: BreakdownSegment[];
  /** Optional vs-last-month delta for the header chip. */
  delta?: {
    current: number;
    previous: number;
    /** Absolute percent change, ≥ 0. */
    pct: number;
    direction: DeltaDirection;
  };
};

export type CompareCard = {
  currentLabel: string;
  previousLabel: string;
  current: number;
  previous: number;
  /** Absolute percent change, ≥ 0. */
  pct: number;
  direction: DeltaDirection;
};

export type ForecastCard = {
  /** Spent so far this month. */
  spent: number;
  /** Projected end-of-month total. */
  projected: number;
  /** Optional income reference line for the sparkline. */
  income?: number;
  /** 95% CI band on the projection. */
  ciLow: number;
  ciHigh: number;
  daysElapsed: number;
  daysInMonth: number;
  /** Pace verdict: good (under) · watch (near) · over (pacing above baseline/income). */
  status: CardStatus;
};

export type CoachReason = {
  label: string;
  /** Optional supporting numbers, e.g. "₱8,000 vs ₱5,000 usual". */
  detail?: string;
  /** Optional inline progress bar (current against a baseline/limit). */
  bar?: { value: number; limit: number; status: CardStatus };
};

export type CoachCard = {
  status: CardStatus;
  /** Short header, e.g. "Heads up" / "Nice work". */
  title: string;
  /** The actionable one-liner (mirrors `Insights.coach.message` or a specific nudge). */
  message: string;
  /** 1–3 supporting reason rows (the anomaly / bill / trajectory that triggered it). */
  reasons?: CoachReason[];
};

/** Fields shared across every card kind. */
type CardCommon = { action?: CardAction };

/**
 * The graphical card payload a reply can carry — a discriminated union, fully
 * populated by the brain and rendered dumbly by `ChatCardView`.
 *
 * `budget` (FINO_CHATBOT_CARDS.md §3.2) is intentionally **deferred** (§10 Q1):
 * it is the only kind needing per-category budgets threaded into `BrainContext`.
 * Add it here once that ctx data lands.
 */
export type ChatCard = CardCommon &
  (
    | { kind: 'breakdown'; data: BreakdownCard }
    | { kind: 'compare'; data: CompareCard }
    | { kind: 'forecast'; data: ForecastCard }
    | { kind: 'coach'; data: CoachCard }
  );

export type ChatCardKind = ChatCard['kind'];

// ─── Brain I/O ───────────────────────────────────────────────────────────────

export type BrainResponse = {
  text: string;
  /** Optional graphical payload, rendered inside the bubble (§3). Back-compatible. */
  card?: ChatCard;
  /** Optional tappable suggested prompts rendered under the reply. */
  followUps?: string[];
};

/**
 * Live financial context the ChatScreen already holds. Passed into
 * `routeMessage` so the brain can answer insight questions with real numbers,
 * fully offline. The engine narrates these — it never invents numbers.
 */
export type BrainContext = {
  /** Total balance across all accounts. */
  balance: number;
  /** Income logged this calendar month. */
  income: number;
  /** Expenses logged this calendar month. */
  spent: number;
  /** Expenses logged last calendar month (0 if none). */
  lastMonthSpent: number;
  /** This month's expense, grouped by category, sorted high → low. */
  topCategories: { name: string; amount: number }[];
  /** Today's day-of-month (1-31), for pro-rating the savings forecast. */
  dayOfMonth: number;
  /** Days in the current month, for pro-rating the savings forecast. */
  daysInMonth: number;
  /**
   * Pre-computed Insights, resolved by ChatScreen (`getInsights` is async; the
   * brain stays synchronous and offline-pure). Unlocks the forecast / coach
   * cards. Optional — when absent, card builders degrade to text-only answers,
   * so the brain is back-compatible without it (FINO_CHATBOT_CARDS.md §9).
   */
  insights?: Insights;
};
