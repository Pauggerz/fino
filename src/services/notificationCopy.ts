/**
 * Centralised notification copy.
 *
 * Every user-facing notification string lives here so phrasing can be iterated
 * without touching business logic. The Deno-side dispatchers keep an equivalent
 * file at supabase/functions/_shared/copy.ts — keep the two in sync (a CI hash
 * check guards against drift; see plan §6.31).
 *
 * Strings are written for VoiceOver clarity: no leading decorative emoji,
 * amounts spelled with the ₱ symbol (Fino's primary market is the Philippines).
 */

export interface NotificationContent {
  title: string;
  body: string;
}

/** ₱ formatter — whole pesos with thousands separators. */
export function fmtPeso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`;
}

interface BillLike {
  title: string;
  amount?: number | null;
}

interface IncomeLike {
  title: string;
  amount: number;
}

interface GoalLike {
  name: string;
  currentAmount: number;
  targetAmount: number;
}

const amountSuffix = (amount?: number | null): string =>
  amount != null ? `${fmtPeso(amount)} — ` : '';

export const copy = {
  billDue: {
    today: (b: BillLike): NotificationContent => ({
      title: `${b.title} due today`,
      body: `${amountSuffix(b.amount)}tap to mark paid.`,
    }),
    tomorrow: (b: BillLike): NotificationContent => ({
      title: `${b.title} due tomorrow`,
      body: `${amountSuffix(b.amount)}heads up!`,
    }),
    inNDays: (b: BillLike, n: number): NotificationContent => ({
      title: `${b.title} due in ${n} days`,
      body: `${amountSuffix(b.amount)}plan ahead.`,
    }),
  },
  payday: (i: IncomeLike): NotificationContent => ({
    title: 'Payday today',
    body: `${i.title} — ${fmtPeso(i.amount)} expected. Log it when it lands.`,
  }),
  budgetWarn: (category: string, pct: number): NotificationContent => ({
    title: `${category} budget alert`,
    body: `You've used ${pct}% of your ${category} budget.`,
  }),
  budgetOver: (category: string, pct: number): NotificationContent => ({
    title: `${category} over budget`,
    body: `${pct}% used. Adjust the cap or rein it in.`,
  }),
  goalMilestone: (g: GoalLike, pct: number): NotificationContent => ({
    title: `${g.name}: ${pct}% there`,
    body: `${fmtPeso(g.currentAmount)} of ${fmtPeso(g.targetAmount)} saved.`,
  }),
  weeklyDigest: (s: { spent: number; saved: number }): NotificationContent => ({
    title: 'Your week in money',
    body: `Spent ${fmtPeso(s.spent)}, saved ${fmtPeso(s.saved)}.`,
  }),
  /** Redacted variant for lockscreen privacy (§6.36). */
  redacted: (): NotificationContent => ({
    title: 'Fino',
    body: 'Tap to view.',
  }),
};
