/**
 * Deno-compatible mirror of src/services/notificationCopy.ts.
 *
 * Keep in sync with the client copy file — a CI hash check should fail the build
 * on drift (plan §6.31). Strings are written for VoiceOver clarity (no leading
 * decorative emoji); amounts use the ₱ symbol (primary market: Philippines).
 */

export interface NotificationContent {
  title: string;
  body: string;
}

export function fmtPeso(amount: number): string {
  return `₱${Math.round(amount).toLocaleString('en-PH')}`;
}

const amountSuffix = (amount?: number | null): string =>
  amount != null ? `${fmtPeso(amount)} — ` : '';

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
  redacted: (): NotificationContent => ({
    title: 'Fino',
    body: 'Tap to view.',
  }),
};
