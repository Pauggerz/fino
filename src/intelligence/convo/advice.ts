/**
 * Financial advice & coaching (FINO_CHATBOT V3, Category 4). Pure, data-aware
 * templates that turn the live `BrainContext` into actionable coaching, each
 * rendered as a `coach` card (headline + reason rows) carrying **action
 * buttons** — "do" actions navigate to a pre-filled screen the user confirms
 * (no silent writes, the V3 decision).
 *
 * No theme, no DB, no async. The advice never invents numbers: when the context
 * is thin it gives the generic rule and points at the relevant screen.
 */

import type {
  BrainContext,
  BrainResponse,
  CardAction,
  ChatCard,
  CoachReason,
  CardStatus,
} from './types';
import type { Slots } from './slots';
import { peso, pctOf } from './nlg';

const SET_BUDGETS: CardAction = {
  kind: 'navigate',
  label: 'Set budgets',
  target: 'categories',
};
const REVIEW_SUBSCRIPTIONS: CardAction = {
  kind: 'navigate',
  label: 'Review subscriptions',
  target: 'recurringBills',
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Assemble a coach-style advice card (theme-free) with optional action chips. */
function adviceCard(args: {
  status: CardStatus;
  title: string;
  message: string;
  reasons?: CoachReason[];
  actions?: CardAction[];
}): ChatCard {
  return {
    kind: 'coach',
    data: {
      status: args.status,
      title: args.title,
      message: args.message,
      reasons: args.reasons?.length ? args.reasons : undefined,
    },
    actions: args.actions,
  };
}

/** Best monthly-expense baseline available from the context. */
function monthlyExpense(ctx: BrainContext): number {
  const avg = ctx.insights?.trajectory?.rolling3MoAvg;
  if (avg && avg > 0) return avg;
  if (ctx.lastMonthSpent > 0) return ctx.lastMonthSpent;
  return ctx.spent;
}

const ADVICE_FOLLOWUPS = ['Where can I cut back?', 'Am I on track to save?'];

// ─── Subscription cut ────────────────────────────────────────────────────────

export function answerSubscriptionCut(ctx: BrainContext): BrainResponse {
  const followUps = ADVICE_FOLLOWUPS;
  const subs = [...(ctx.insights?.recurring ?? [])].sort(
    (a, b) => b.amount - a.amount
  );
  if (!subs.length) {
    return {
      text: "I haven't spotted any recurring subscriptions yet — they surface once a charge repeats across a few months. You can review your bills in the meantime.",
      actions: [REVIEW_SUBSCRIPTIONS],
      followUps,
    };
  }
  const monthly = subs.reduce((s, r) => s + r.amount, 0);
  const annual = monthly * 12;
  const reasons: CoachReason[] = subs.slice(0, 3).map((r) => ({
    label: cap(r.merchant),
    detail: `${peso(r.amount)}/mo · ${peso(r.amount * 12)}/yr`,
  }));
  return {
    text: `You're paying about ${peso(monthly)}/mo (${peso(
      annual
    )}/yr) across ${subs.length} recurring ${
      subs.length === 1 ? 'charge' : 'charges'
    }. Cancelling the ones you don't use is the fastest win:`,
    card: adviceCard({
      status: 'watch',
      title: 'Trim your subscriptions',
      message: `Cancelling what you don't use could claw back up to ${peso(
        annual
      )}/yr.`,
      reasons,
      actions: [REVIEW_SUBSCRIPTIONS],
    }),
    followUps,
  };
}

// ─── Emergency fund ──────────────────────────────────────────────────────────

export function answerEmergencyFund(ctx: BrainContext): BrainResponse {
  const followUps = ADVICE_FOLLOWUPS;
  const m = monthlyExpense(ctx);
  if (m <= 0) {
    return {
      text: "An emergency fund is worth 3–6 months of expenses. Log a month or two of spending and I'll put a peso target on it for you.",
      actions: [SET_BUDGETS],
      followUps,
    };
  }
  const lo = Math.round(m * 3);
  const hi = Math.round(m * 6);
  const monthlySetAside = Math.max(500, Math.round(hi / 12 / 100) * 100);
  return {
    text: `A solid emergency fund is 3–6× your monthly spending — for you that's about ${peso(
      lo
    )} to ${peso(hi)}. Automate a set-aside and it builds itself.`,
    card: adviceCard({
      status: 'good',
      title: 'Build an emergency fund',
      message: `Aim for ${peso(hi)} over time — roughly ${peso(
        monthlySetAside
      )}/mo gets you there in a year.`,
      reasons: [
        { label: 'Starter (3 months)', detail: peso(lo) },
        { label: 'Full cushion (6 months)', detail: peso(hi) },
      ],
      actions: [
        {
          kind: 'navigate',
          label: 'Create goal',
          target: 'savingsGoal',
          params: {
            name: 'Emergency Fund',
            target: hi,
            monthlyContribution: monthlySetAside,
          },
        },
      ],
    }),
    followUps,
  };
}

// ─── Goal plan ("save for a laptop") ─────────────────────────────────────────

const GOAL_NAME_RE =
  /(?:save(?: up)? for|saving for|towards?|buy|afford|put away for)(?: a| an| my| the| some| new| brand new)*\s+([a-z][a-z]+(?: [a-z]+)?)/;

function parseGoalName(norm: string): string | undefined {
  const m = GOAL_NAME_RE.exec(norm);
  if (!m) return undefined;
  // Trim trailing filler so "laptop how should i adjust" → "laptop".
  const STOP = new Set([
    'how',
    'and',
    'so',
    'to',
    'then',
    'this',
    'that',
    'soon',
    'asap',
    'before',
    'within',
    'by',
    'in',
    'for',
    'because',
    'since',
  ]);
  const words = m[1].split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    if (STOP.has(w)) break;
    kept.push(w);
  }
  const name = kept.join(' ').trim();
  return name.length >= 3 ? name : undefined;
}

export function answerGoalPlan(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ADVICE_FOLLOWUPS;
  const target = slots.amounts.length ? Math.max(...slots.amounts) : undefined;
  const name = parseGoalName(norm);
  const goalLabel = name ? cap(name) : 'Savings goal';

  if (!target) {
    return {
      text: `Tell me the price tag — e.g. "save for a ₱60,000 ${
        name ?? 'laptop'
      }" — and I'll work out a monthly set-aside. You can also start the goal now and add the amount there.`,
      card: adviceCard({
        status: 'good',
        title: `Save for ${name ?? 'your goal'}`,
        message: "Set a target and I'll pace it against your savings rate.",
        actions: [
          {
            kind: 'navigate',
            label: 'Create goal',
            target: 'savingsGoal',
            params: name ? { name: goalLabel } : {},
          },
        ],
      }),
      followUps,
    };
  }

  const saveable = Math.max(0, ctx.income - ctx.spent);
  const baseline = Math.max(500, Math.round(target / 12));
  // Don't suggest setting aside more than the user realistically saves.
  const suggested = saveable > 0 ? Math.min(saveable, baseline) : baseline;
  const months = Math.max(1, Math.ceil(target / Math.max(1, suggested)));
  return {
    text: `To reach ${goalLabel} (${peso(target)}), set aside about ${peso(
      suggested
    )}/month — roughly ${months} month${months === 1 ? '' : 's'} at that pace.`,
    card: adviceCard({
      status: 'good',
      title: `Save for ${name ?? 'your goal'}`,
      message: `${peso(suggested)}/mo → ${peso(target)} in about ${months} month${
        months === 1 ? '' : 's'
      }.`,
      reasons: [
        { label: 'Target', detail: peso(target) },
        { label: 'Monthly set-aside', detail: peso(suggested) },
      ],
      actions: [
        {
          kind: 'navigate',
          label: 'Create goal',
          target: 'savingsGoal',
          params: {
            name: goalLabel,
            target,
            monthlyContribution: suggested,
          },
        },
      ],
    }),
    followUps,
  };
}

// ─── Bonus advice ────────────────────────────────────────────────────────────

export function answerBonusAdvice(ctx: BrainContext): BrainResponse {
  const followUps = ADVICE_FOLLOWUPS;
  const hasEmergency = monthlyExpense(ctx) > 0;
  return {
    text: 'Nice — a bonus is a great chance to get ahead. A simple split keeps it from disappearing:',
    card: adviceCard({
      status: 'good',
      title: 'Make your bonus count',
      message:
        'Bank most of it, clear a little debt, and enjoy a slice guilt-free.',
      reasons: [
        { label: 'Save / emergency fund', detail: '~50%' },
        { label: 'Debt or a goal', detail: '~30%' },
        { label: 'Treat yourself', detail: '~20%' },
      ],
      actions: [
        {
          kind: 'navigate',
          label: 'Create goal',
          target: 'savingsGoal',
          params: hasEmergency ? { name: 'Bonus savings' } : {},
        },
      ],
    }),
    followUps,
  };
}

// ─── Improve savings rate ────────────────────────────────────────────────────

export function answerImproveSavings(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  const saved = Math.max(0, ctx.income - ctx.spent);
  const rate = ctx.income > 0 ? pctOf(saved, ctx.income) : 0;
  const top = ctx.topCategories[0];
  const reasons: CoachReason[] = top
    ? [
        {
          label: top.name,
          detail: `${peso(top.amount)} — a 15% trim frees ${peso(
            top.amount * 0.15
          )}/mo`,
        },
      ]
    : [];
  const lever = top
    ? `Your quickest lever is ${top.name}, your biggest category — even a small trim there compounds.`
    : "Log a bit more spending and I'll point to the category with the most give.";
  return {
    text: `${
      ctx.income > 0
        ? `You're saving about ${rate}% of your income right now. `
        : ''
    }${lever}`,
    card: adviceCard({
      status: 'watch',
      title: 'Lift your savings rate',
      message: "Cap your top categories and automate what's left over.",
      reasons,
      actions: [SET_BUDGETS],
    }),
    followUps,
  };
}

// ─── Cut a target amount ─────────────────────────────────────────────────────

export function answerCutAmount(
  ctx: BrainContext,
  slots: Slots
): BrainResponse {
  const followUps = ['Where can I cut back?', 'Am I overspending anywhere?'];
  const target = slots.amounts.length ? Math.max(...slots.amounts) : undefined;
  if (!target) {
    return {
      text: 'Tell me how much you want to free up — e.g. "where can I cut ₱2,000?" — and I\'ll point at the categories with the most give.',
      followUps,
    };
  }
  if (!ctx.topCategories.length) {
    return {
      text: `I'd need a bit of spending history to find ${peso(
        target
      )} to trim. Log a few expenses and ask again.`,
      followUps,
    };
  }

  // Greedily trim up to 30% from the biggest categories until we cover target.
  let remaining = target;
  const picks: { name: string; trim: number }[] = [];
  for (const c of ctx.topCategories) {
    if (remaining <= 0) break;
    const trim = Math.min(c.amount * 0.3, remaining, c.amount);
    if (trim >= 100) {
      picks.push({ name: c.name, trim });
      remaining -= trim;
    }
  }
  const covered = target - Math.max(0, remaining);
  const reasons: CoachReason[] = picks.map((p) => ({
    label: p.name,
    detail: `trim ~${peso(p.trim)}`,
  }));
  const shortfall =
    remaining > 1
      ? ` That covers ${peso(covered)} — the rest would need a deeper cut.`
      : '';
  return {
    text: `To free up ${peso(target)} this month, here's where I'd trim first:${shortfall}`,
    card: adviceCard({
      status: 'watch',
      title: `Find ${peso(target)} to cut`,
      message: 'Capping these for the month gets you most of the way there.',
      reasons,
      actions: [SET_BUDGETS],
    }),
    followUps,
  };
}

// ─── Rule of thumb (50/30/20) ────────────────────────────────────────────────

export function answerRuleOfThumb(ctx: BrainContext): BrainResponse {
  const followUps = ['Show me my needs vs my wants', 'Where can I cut back?'];
  const inc = ctx.income;
  if (inc <= 0) {
    return {
      text: "A classic is the 50/30/20 rule: 50% of income to needs, 30% to wants, 20% to savings. Log your income and I'll plug in your numbers.",
      card: adviceCard({
        status: 'good',
        title: 'The 50/30/20 rule',
        message: 'Half to needs, a third to wants, a fifth to savings.',
        actions: [SET_BUDGETS],
      }),
      followUps,
    };
  }
  const needs = inc * 0.5;
  const wants = inc * 0.3;
  const save = inc * 0.2;
  return {
    text: `A simple guide is the 50/30/20 rule. On your ${peso(
      inc
    )} income that's ${peso(needs)} for needs, ${peso(wants)} for wants, and ${peso(
      save
    )} to savings.`,
    card: adviceCard({
      status: 'good',
      title: 'The 50/30/20 rule',
      message: `Your split: ${peso(needs)} / ${peso(wants)} / ${peso(save)}.`,
      reasons: [
        { label: 'Needs (50%)', detail: peso(needs) },
        { label: 'Wants (30%)', detail: peso(wants) },
        { label: 'Savings (20%)', detail: peso(save) },
      ],
      actions: [SET_BUDGETS],
    }),
    followUps,
  };
}

// ─── Impulse-buying tips (no data needed) ────────────────────────────────────

export function answerImpulseTips(): BrainResponse {
  return {
    text: 'A few tricks that help beat impulse buys:',
    card: adviceCard({
      status: 'good',
      title: 'Beat impulse buys',
      message: 'Add friction and the urge usually passes.',
      reasons: [
        { label: 'Sleep on it', detail: 'Wait 24h on any non-essential buy' },
        { label: 'Un-save your cards', detail: 'Make checkout take effort' },
        {
          label: 'Give wants a budget',
          detail: 'A capped "fun" line, guilt-free',
        },
      ],
      actions: [SET_BUDGETS],
    }),
    followUps: ['Show me my needs vs my wants', 'Where can I cut back?'],
  };
}
