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
 * A navigation destination the brain can point a button at. The renderer
 * (`ChatScreen.handleCardAction`) maps each target to a concrete screen — the
 * brain never holds a navigator. "Do" actions (V3) navigate to a screen
 * **pre-filled** via `params` so the user confirms there (no silent writes).
 */
export type NavTarget =
  | 'insights'
  | 'savingsGoal'
  | 'recurringBills'
  | 'recurringIncome'
  | 'categories'
  | 'addTransaction'
  | 'transactionDetail'
  | 'accounts'
  | 'cashFlow';

/**
 * A tappable button the brain emits (theme-free, navigator-free), dispatched by
 * ChatScreen. `navigate` opens a screen (optionally pre-filled); `prompt`
 * re-enters the send path with a canned query so a card can suggest a follow-up.
 */
export type CardAction =
  | {
      kind: 'navigate';
      label: string;
      target: NavTarget;
      params?: Record<string, unknown>;
    }
  | { kind: 'prompt'; label: string; send: string };

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

// ─── Transaction-list + status cards (V3, Category 1) ────────────────────────

/** One row in a `txList` card — a single transaction, tappable to its detail. */
export type TxListRow = {
  id: string;
  /** Best label: display name → merchant → category → "Transaction". */
  name: string;
  category: string | null;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  /** ISO date string; the renderer formats it. */
  date: string;
};

/**
 * A list of transactions answering "last 5", "over ₱5k this year", "tagged
 * Entertainment", "highest expense yesterday". Rows deep-link to
 * `TransactionDetail` via the renderer.
 */
export type TxListCard = {
  /** Section header, e.g. "Last 5 transactions" / "Over ₱5,000 this year". */
  title: string;
  rows: TxListRow[];
  /** Sum of the matched set (omitted for plain "recent" lists). */
  total?: number;
  /** Total matches when `rows` is a capped slice (so the card can say "+N more"). */
  matchCount?: number;
};

/**
 * A yes/no answer ("did my salary hit?", "did I pay the internet bill?").
 * `yes` is the answer; `status` drives the colour (good = yes/paid,
 * watch = pending/unknown, over = overdue/problem). `tx` is the matched row.
 */
export type StatusCard = {
  yes: boolean;
  status: CardStatus;
  title: string;
  message: string;
  tx?: TxListRow;
};

// ─── Summary / budget / needs-wants / pattern cards (V3, Categories 2 & 3) ───

/**
 * A range-scoped money summary ("Q1", "this week", "the weekend", "income vs
 * expenses", "fixed vs variable"). In/out/net header + a mini category
 * breakdown. `savingsRate` is omitted when there's no income to divide by.
 */
export type SummaryCard = {
  /** Range label for the eyebrow, e.g. "Q1" / "this week". */
  label: string;
  income: number;
  expense: number;
  /** income − expense (may be negative). */
  net: number;
  /** net / income ∈ [-1, 1]; omitted when income is 0. */
  savingsRate?: number;
  /** Top expense categories for the range (sorted high → low, capped). */
  segments: BreakdownSegment[];
};

/** One category's progress against its budget limit. */
export type BudgetRow = {
  label: string;
  spent: number;
  limit: number;
  /** good = comfortably under · watch = near/pacing over · over = exceeded. */
  status: CardStatus;
};

/**
 * Budget-health card: a `ProgressBar` per budgeted category with the limit
 * marker, plus an optional month-progress fraction so the renderer can show
 * pace. Unblocked now that `Category.budgetLimit` is threaded into context.
 */
export type BudgetCard = {
  rows: BudgetRow[];
  /** Fraction of the month elapsed (0..1) — the pace reference line. */
  monthProgress?: number;
};

/**
 * A rough needs-vs-wants split (Category 2). Two-segment bar + ratio. Always
 * surfaced as approximate (`needsWants.ts` heuristic); `unknown` spend is shown
 * as a caveat, never folded into the bar.
 */
export type NeedsWantsCard = {
  need: number;
  want: number;
  /** need / (need + want) ∈ [0, 1]. */
  needPct: number;
  /** Spend the heuristic couldn't classify (excluded from the bar). */
  unknown?: number;
};

/** One bar in a `pattern` card. `highlight` flags the peak/featured bar — the
 *  renderer colours highlight (and `direction`) against the theme; non-highlight
 *  bars stay muted, so no palette `role` is needed here. */
export type PatternBar = {
  label: string;
  amount: number;
  highlight?: boolean;
};

/**
 * A spending-pattern visual: day-of-week bars ("what day do I spend most") or a
 * short trend series ("is transport trending up"). `caption` is the headline
 * finding; `direction` colours the trend arrow when present.
 */
export type PatternCard = {
  /** Eyebrow, e.g. "SPENDING BY DAY" / "TRANSPORT, WEEK OVER WEEK". */
  title: string;
  /** The plain-language finding, e.g. "You spend most on Fridays". */
  caption: string;
  bars: PatternBar[];
  direction?: DeltaDirection;
};

/** Fields shared across every card kind. `action` is the single primary chip
 *  (back-compat); `actions` is the V3 multi-button row (e.g. advice cards). */
type CardCommon = { action?: CardAction; actions?: CardAction[] };

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
    | { kind: 'txList'; data: TxListCard }
    | { kind: 'status'; data: StatusCard }
    | { kind: 'summary'; data: SummaryCard }
    | { kind: 'budget'; data: BudgetCard }
    | { kind: 'needsWants'; data: NeedsWantsCard }
    | { kind: 'pattern'; data: PatternCard }
  );

export type ChatCardKind = ChatCard['kind'];

// ─── Transaction query surface (V3) ──────────────────────────────────────────

/**
 * A lightweight transaction row the ChatScreen injects so the brain can answer
 * record-level questions ("last 5", "the ₱1,500 charge", "over ₱5k this year")
 * with a pure, synchronous query — no DB, no async, in the brain. ChatScreen
 * builds a bounded snapshot (a trailing analytical window) from WatermelonDB and
 * passes it through `BrainContext.transactions`. `convo/query.ts` filters and
 * aggregates over it.
 */
export type TxLite = {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  /** User's category name, lower-cased upstream not required. */
  category: string | null;
  /** Best merchant string: `merchant_name ?? display_name`. Used for free-text
   *  merchant search (e.g. "Spotify") that the taxonomy may not know. */
  merchant: string | null;
  /** Display name as logged. */
  name: string | null;
  /** ISO date string (the transaction's `date` column). */
  date: string;
  accountId: string;
  accountName?: string;
};

/** An account summary row for "balance across all accounts". (Named to avoid
 *  colliding with categorize.ts's `AccountLite` on the `@/intelligence` barrel.) */
export type AccountSummary = {
  id: string;
  name: string;
  balance: number;
  type?: string;
};

/** A per-category budget limit (from `Category.budgetLimit`). */
export type BudgetLite = { category: string; limit: number };

/** A configured recurring income (for "did my salary hit yet?"). */
export type RecurringIncomeLite = {
  label: string;
  amount: number;
  dayOfMonth?: number;
};

// ─── Brain I/O ───────────────────────────────────────────────────────────────

export type BrainResponse = {
  text: string;
  /** Optional graphical payload, rendered inside the bubble (§3). Back-compatible. */
  card?: ChatCard;
  /** Optional reply-level action buttons rendered under the bubble (V3) — e.g.
   *  "Create goal", "Review subscriptions". Distinct from a card's own action. */
  actions?: CardAction[];
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
  /** ISO timestamp of "now", so the bridge can derive a deterministic
   *  this-month range (salary / bill status). Optional — defaults to `new
   *  Date()` when absent, but tests inject it for reproducibility. */
  now?: string;
  /**
   * Pre-computed Insights, resolved by ChatScreen (`getInsights` is async; the
   * brain stays synchronous and offline-pure). Unlocks the forecast / coach
   * cards. Optional — when absent, card builders degrade to text-only answers,
   * so the brain is back-compatible without it (FINO_CHATBOT_CARDS.md §9).
   */
  insights?: Insights;

  // ── Transaction-query surface (V3) — all optional & back-compatible ──────────

  /**
   * Bounded snapshot of recent transactions (trailing analytical window) the
   * brain queries synchronously for record-level answers. When absent, the
   * transaction-query intents degrade to a "open Insights" text reply.
   */
  transactions?: TxLite[];
  /** Per-account balances, for "balance across all accounts". */
  accounts?: AccountSummary[];
  /** Per-category budget limits, for budget-status / "set a budget" answers. */
  budgets?: BudgetLite[];
  /** Configured recurring income, for "did my salary hit yet?". */
  recurringIncome?: RecurringIncomeLite[];
};
