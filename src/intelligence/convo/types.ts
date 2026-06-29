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
import type { TimeRange } from '../core/time';
import type { CategorySlot } from './slots';

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
  | 'cashFlow'
  | 'utangTracker'
  | 'billSplitter';

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

/** A configured recurring bill (for "when is my next bill due?" /
 *  "what bills are coming up?"). Mirrors the `recurring_bills` model fields the
 *  brain narrates; `nextDueAt` is the ISO date of the next expected charge. */
export type RecurringBillLite = {
  label: string;
  amount: number;
  cadence?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextDueAt?: string;
};

/**
 * One Utang-tracker row — money owed **to** the user (a receivable). `debtor` is
 * the person who owes them; `remaining = total − paid`. The brain answers debt
 * questions ("how much do I owe", "who owes me") from these, always worded as
 * money owed *to* the user (the table never stores the user's own payables).
 */
export type DebtLite = {
  debtor: string;
  total: number;
  paid: number;
  remaining: number;
  dueDate?: string;
};

// ─── Mutation proposals (in-chat confirm; brain proposes, ChatScreen executes) ─

/**
 * A change to the user's data that the brain *proposes* but never performs. The
 * brain stays pure, synchronous, and DB-free: it emits this as plain data and
 * ChatScreen renders a Confirm/Cancel card, running the matching mutation
 * service ONLY after the user confirms — the repo's "no silent writes" rule.
 *
 * Split is intentionally NOT a mutation here: it's handled by navigating to a
 * pre-filled BillSplitter (where the user confirms on the real screen), not an
 * in-chat write — see `answerSplitBill`. A true in-chat split service is
 * deferred (chat-mutations plan, Phase 4).
 */
export type BrainMutation =
  | {
      kind: 'recategorize';
      /** Transaction to move (the snapshot row id === the Watermelon/Supabase id). */
      txId: string;
      /** Best human label for the tx (name → merchant), for the confirm copy. */
      txLabel: string;
      /** Current category for the "from X" copy (null/Other when uncategorized). */
      fromCategory: string | null;
      /** Destination category name to write. */
      toCategory: string;
    }
  | {
      kind: 'setBudget';
      /** Category NAME to budget (ChatScreen resolves name → row id at execute;
       *  an unknown name degrades to a navigate-prefill, never a silent write). */
      category: string;
      /** Monthly limit in pesos. */
      limit: number;
    }
  | {
      kind: 'delete';
      /** Transaction to delete (snapshot row id === Watermelon/Supabase id). */
      txId: string;
      /** Human label + amount for the destructive confirm copy. */
      txLabel: string;
      amount: number;
    }
  | {
      kind: 'transfer';
      amount: number;
      /** Both sides resolved against `BrainContext.accounts` before proposing —
       *  an unresolved side yields a clarify reply, never a guessed transfer. */
      fromAccountId: string;
      fromLabel: string;
      toAccountId: string;
      toLabel: string;
    };

// ─── Conversational memory (short-term, multi-turn) ──────────────────────────

/**
 * One resolved turn the brain remembers so a follow-up can lean on it
 * ("how much on food?" → "what about last month?"). Holds only the small,
 * already-resolved facts a continuation might inherit — never the raw text or
 * the rendered card. ChatScreen owns the rolling window; the brain reads it
 * from `BrainContext.memory` and returns an updated window on `BrainResponse`,
 * so the engine itself stays pure & synchronous (no module state).
 */
export type ConversationTurn = {
  /** The intent the brain settled on for this turn (null when it fell back). */
  intent: string | null;
  /** The category slot the turn was scoped to ("food"), if any — kept whole so
   *  a continuation can inherit it directly into its own slots. */
  category?: CategorySlot;
  /** The turn's resolved time window, if any — kept whole (with its `start`/
   *  `end` Dates) so a same-session follow-up ("and transport?") inherits the
   *  exact window without re-parsing. `start`/`end` are resolved against the
   *  turn's `now`; the short continuation TTL keeps them from going stale. */
  timeRange?: TimeRange;
  /** Amounts present in the turn, for "make it ₱500 instead" style follow-ups. */
  amounts?: number[];
  /** Free-text merchant the turn referenced ("Spotify"), if any. */
  merchant?: string;
  /** ISO timestamp the turn was resolved — lets ChatScreen expire stale memory. */
  at: string;
};

/**
 * The short-term memory window: the most-recent resolved turns, newest last.
 * Bounded by ChatScreen (see CONVERSATION_MEMORY_MAX). Passed into every
 * `routeMessage` call and replaced wholesale by the value the brain returns.
 */
export type ConversationMemory = {
  turns: ConversationTurn[];
};

// ─── Brain I/O ───────────────────────────────────────────────────────────────

/**
 * Diagnostic metadata about how a turn was classified — attached to every
 * `routeMessage` result so the impure host (ChatScreen) can (a) pick the
 * intent-accurate "working" steps and skip the beat for chit-chat, and (b) log
 * a genuine miss (`intent === null`) to the local miss-telemetry buffer that
 * grows the training corpus. Purely informational; the brain stays pure.
 */
export type BrainResponseMeta = {
  /** Which layer decided: 'rules' / 'classifier', or 'none' for a true
   *  fallback (rules silent + classifier abstained + nothing inherited). */
  source: 'rules' | 'classifier' | 'none';
  /** The intent finally answered (after memory carry-over); null on fallback. */
  intent: string | null;
  /** Winning rule margin (top-1 − top-2 weight). */
  ruleMargin: number;
  /** In-vocabulary classifier feature count (0 = no signal at all). */
  mlMatched: number;
};

export type BrainResponse = {
  text: string;
  /** Optional graphical payload, rendered inside the bubble (§3). Back-compatible. */
  card?: ChatCard;
  /** Optional reply-level action buttons rendered under the bubble (V3) — e.g.
   *  "Create goal", "Review subscriptions". Distinct from a card's own action. */
  actions?: CardAction[];
  /** Optional tappable suggested prompts rendered under the reply. */
  followUps?: string[];
  /** Optional proposed data change. When present, ChatScreen renders a
   *  Confirm/Cancel card and runs the mutation only on confirm (no silent
   *  writes). Never persisted in chat history, so a stale proposal can't be
   *  re-confirmed after reopen. */
  mutation?: BrainMutation;
  /** Updated short-term memory after this turn (the window with the new turn
   *  appended, oldest trimmed). ChatScreen stores it and threads it back in on
   *  the next call. Absent when the turn carried nothing worth remembering. */
  memory?: ConversationMemory;
  /** Diagnostic classification metadata (see {@link BrainResponseMeta}). The
   *  host reads it for UI steps + miss-telemetry; never persisted. */
  meta?: BrainResponseMeta;
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
  /**
   * ISO date of the oldest moment the snapshot fully covers (the query window
   * start, or the oldest loaded row when the row cap truncated the window).
   * Lets range answers be honest — a request reaching further back than this
   * gets a "data only goes back to …" caveat instead of a silent undercount.
   */
  snapshotStart?: string;
  /** Per-account balances, for "balance across all accounts". */
  accounts?: AccountSummary[];
  /** Per-category budget limits, for budget-status / "set a budget" answers. */
  budgets?: BudgetLite[];
  /** Configured recurring income, for "did my salary hit yet?". */
  recurringIncome?: RecurringIncomeLite[];
  /** Configured recurring bills, for "when is my next bill due?". */
  recurringBills?: RecurringBillLite[];
  /** Utang-tracker receivables (money owed TO the user), for debt questions. */
  debts?: DebtLite[];

  /**
   * Short-term conversational memory — the recent resolved turns ChatScreen
   * carries forward. The brain reads it to fill gaps in a follow-up (inherit the
   * last intent/category/time window when the new message only supplies a
   * fragment) and returns an updated window on `BrainResponse.memory`. Optional
   * & back-compatible: without it the brain behaves exactly as the stateless
   * single-turn engine.
   */
  memory?: ConversationMemory;
};
