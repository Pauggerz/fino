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
import { peso, pctOf, cap } from './nlg';

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
  let name = parseGoalName(norm);
  let { amounts } = slots;
  // A small number right after the goal name ("iphone 17", "switch 2") is a
  // model number, not a price — fold it into the name and never use it as the
  // target, or "buy iPhone 17" becomes a ₱17 goal.
  if (name) {
    // `name` is parseGoalName output — guaranteed [a-z ]+, no regex escaping
    // needed.
    const modelMatch = new RegExp(`\\b${name}\\s+(\\d{1,2})\\b`).exec(norm);
    if (modelMatch) {
      name = `${name} ${modelMatch[1]}`;
      const modelNo = Number(modelMatch[1]);
      amounts = amounts.filter((a) => a !== modelNo);
    }
  }
  const target = amounts.length ? Math.max(...amounts) : undefined;
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

// ─── Affordability ("can I afford / can I buy X") ────────────────────────────

/**
 * Answer an affordability question. With a price it's a clear yes/no against the
 * on-hand balance (flagged "tight" when it eats most of the buffer); without a
 * price we report what's available and ask for the figure — never a fabricated
 * verdict. A purchase beyond reach offers a pre-filled savings goal.
 */
export function answerAfford(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ADVICE_FOLLOWUPS;
  const price = slots.amounts.length ? Math.max(...slots.amounts) : undefined;
  const item = parseGoalName(norm);
  const { balance } = ctx;
  const saveable = Math.max(0, ctx.income - ctx.spent);

  // No price → can't give a verdict. Report what's on hand and ask for the tag.
  if (!price) {
    const savingLine =
      saveable > 0
        ? ` You've set aside about ${peso(saveable)} this month.`
        : '';
    return {
      text: `You've got ${peso(balance)} on hand.${savingLine} Tell me the price${
        item ? ` of the ${item}` : ''
      } and I'll give you a clear yes or no — or I can help you start a savings goal for it.`,
      card: adviceCard({
        status: 'good',
        title: item ? `Thinking about a ${item}?` : 'Can you afford it?',
        message: `${peso(balance)} available right now — share the price for a yes/no.`,
        actions: [
          {
            kind: 'navigate',
            label: 'Start a savings goal',
            target: 'savingsGoal',
            params: item ? { name: cap(item) } : {},
          },
        ],
      }),
      followUps,
    };
  }

  // Beyond the current balance → honest "not yet" + a pre-filled goal to get there.
  if (price > balance) {
    const monthly = Math.max(500, Math.round(price / 12));
    const months = Math.max(1, Math.ceil(price / monthly));
    return {
      text: `Not just yet — ${item ? `a ${item} at ` : ''}${peso(
        price
      )} is more than your ${peso(balance)} balance. Setting aside ${peso(
        monthly
      )}/mo would get you there in about ${months} month${
        months === 1 ? '' : 's'
      }.`,
      card: {
        kind: 'status',
        data: {
          yes: false,
          status: 'over',
          title: 'Not right now',
          message: `${peso(price)} vs your ${peso(balance)} balance.`,
        },
        actions: [
          {
            kind: 'navigate',
            label: 'Plan it as a goal',
            target: 'savingsGoal',
            params: {
              name: item ? cap(item) : 'Purchase',
              target: price,
              monthlyContribution: monthly,
            },
          },
        ],
      },
      followUps,
    };
  }

  // Affordable. Flag "tight" when it would eat more than half the balance.
  const tight = price > balance * 0.5;
  return {
    text: tight
      ? `You can, but it's a big chunk — ${peso(price)} out of your ${peso(
          balance
        )} balance. If it's not urgent, spacing it out keeps a buffer.`
      : `Yes — ${peso(price)} fits comfortably within your ${peso(
          balance
        )} balance.`,
    card: {
      kind: 'status',
      data: {
        yes: true,
        status: tight ? 'watch' : 'good',
        title: tight ? 'Doable, but tight' : 'You can afford it',
        message: `${peso(price)} of your ${peso(balance)} balance.`,
      },
    },
    followUps,
  };
}

// ─── Safe to spend ───────────────────────────────────────────────────────────

/**
 * "How much is safe to spend (for the rest of the month)?" Budget-first: when
 * the user has category budgets, it's what's left of their limits, paced over
 * the days remaining. Otherwise it falls back to income − spend this month, and
 * finally to the on-hand balance. Pure narration over the live context — never
 * invents a number, and clamps to the on-hand balance so it can't promise money
 * the user doesn't have.
 */
export function answerSafeToSpend(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Am I on track to save?'];
  const remainingDays = Math.max(1, ctx.daysInMonth - ctx.dayOfMonth + 1);
  const budgets = ctx.budgets ?? [];

  let safe: number;
  let basis: 'budget' | 'income' | 'balance';
  if (budgets.length) {
    const spentFor = (cat: string): number =>
      ctx.topCategories.find((c) => c.name.toLowerCase() === cat.toLowerCase())
        ?.amount ?? 0;
    const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
    const spentBudgeted = budgets.reduce((s, b) => s + spentFor(b.category), 0);
    safe = totalLimit - spentBudgeted;
    basis = 'budget';
  } else if (ctx.income > 0) {
    safe = ctx.income - ctx.spent;
    basis = 'income';
  } else {
    safe = ctx.balance;
    basis = 'balance';
  }

  // Never promise more than is actually on hand.
  safe = Math.min(safe, ctx.balance);

  // Already over the line → honest caution, point at where to trim.
  if (safe <= 0) {
    const over = peso(Math.abs(safe));
    const why =
      basis === 'budget'
        ? `you're about ${over} past your budgets for the month`
        : basis === 'income'
          ? `you've spent ${over} more than you've earned this month`
          : 'your balance is tapped out';
    return {
      text: `Best to pause non-essentials — ${why}. Want to see where to cut back?`,
      card: adviceCard({
        status: 'over',
        title: 'Nothing safe to spend',
        message: `Hold off on extras for the next ${remainingDays} day${
          remainingDays === 1 ? '' : 's'
        }.`,
        actions: [
          {
            kind: 'prompt',
            label: 'Where can I cut back?',
            send: 'Where can I cut back?',
          },
        ],
      }),
      followUps,
    };
  }

  const perDay = safe / remainingDays;
  const basisLine =
    basis === 'budget'
      ? `That's what's left across your budgets`
      : basis === 'income'
        ? `That's what's left of this month's income after spending`
        : `That's your on-hand balance`;
  const actions: CardAction[] =
    basis === 'balance'
      ? [SET_BUDGETS]
      : [{ kind: 'navigate', label: 'Open Insights', target: 'insights' }];
  return {
    text: `You've got about ${peso(safe)} safe to spend over the next ${remainingDays} day${
      remainingDays === 1 ? '' : 's'
    } — roughly ${peso(perDay)}/day. ${basisLine}.`,
    card: adviceCard({
      status: 'good',
      title: 'Safe to spend',
      message: `${peso(safe)} left · ~${peso(perDay)}/day for ${remainingDays} day${
        remainingDays === 1 ? '' : 's'
      }.`,
      reasons: [
        { label: 'Left this month', detail: peso(safe) },
        { label: 'Per day', detail: `${peso(perDay)} · ${remainingDays}d` },
      ],
      actions,
    }),
    followUps,
  };
}

// ─── Runway ("how long will my money last?", "burn rate") ───────────────────

/**
 * Balance ÷ burn rate, narrated honestly: uses the best monthly-expense
 * baseline available (3-month rolling avg → last month → this month) and
 * always says the estimate assumes no new income.
 */
export function answerRunway(ctx: BrainContext): BrainResponse {
  const followUps = ['How much is safe to spend?', 'Where can I cut back?'];
  const m = monthlyExpense(ctx);
  const { balance } = ctx;

  if (balance <= 0) {
    return {
      text: "Your balance is at zero or below, so there's no runway to measure — let's find something to free up.",
      card: adviceCard({
        status: 'over',
        title: 'No runway',
        message: 'Balance is tapped out — time to trim or top up.',
        actions: [
          {
            kind: 'prompt',
            label: 'Where can I cut back?',
            send: 'Where can I cut back?',
          },
        ],
      }),
      followUps,
    };
  }
  if (m <= 0) {
    return {
      text: `You've got ${peso(balance)} on hand, but I need a month or so of spending history to estimate how long it would last. Log your expenses and ask me again.`,
      followUps,
    };
  }

  const daily = m / 30;
  const days = Math.floor(balance / daily);
  const months = balance / m;
  const monthsR = Math.round(months * 10) / 10;
  const status: CardStatus =
    months < 1 ? 'over' : months < 3 ? 'watch' : 'good';
  const monthsPhrase =
    months >= 1
      ? `roughly ${monthsR} month${monthsR === 1 ? '' : 's'} (about ${days} days)`
      : `only about ${days} day${days === 1 ? '' : 's'}`;
  return {
    text: `At your usual burn of about ${peso(m)}/month (≈${peso(
      daily
    )}/day), your ${peso(balance)} would last ${monthsPhrase} — assuming no new income comes in.`,
    card: adviceCard({
      status,
      title: 'Your runway',
      message: `≈${monthsR} month${monthsR === 1 ? '' : 's'} at the current pace.`,
      reasons: [
        { label: 'On hand', detail: peso(balance) },
        { label: 'Monthly burn', detail: `${peso(m)}/mo` },
        { label: 'Daily burn', detail: `${peso(daily)}/day` },
      ],
      actions: [
        {
          kind: 'prompt',
          label: 'How much is safe to spend?',
          send: 'How much is safe to spend?',
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
