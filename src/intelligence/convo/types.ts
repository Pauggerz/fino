/**
 * Public contract for the Convo brain. These two types are what the ChatScreen
 * threads in and renders out; they are re-exported from `convo/brain.ts` via
 * the `@/intelligence` barrel.
 *
 * Kept identical to the original finoBrain types so swapping the engine was a
 * no-op for callers (FINO_INTELLIGENCE_V2.md §7).
 */

export type BrainResponse = {
  text: string;
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
};
