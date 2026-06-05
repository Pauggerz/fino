/**
 * Intelligence bridge — turns a classified {intent, slots} into a concrete
 * answer narrated from the live `BrainContext` (FINO_INTELLIGENCE_V2.md §4
 * steps 8–9). The engine narrates local math; it NEVER invents numbers — when
 * the context can't answer a question (sub-month ranges, per-purchase counts),
 * it says so and points to the Insights tab rather than guessing.
 *
 * This is the consolidated, expanded home of the old finoBrain `answer*`
 * functions, plus the new balance / income / spend / top-category / help /
 * greeting / thanks / count handlers.
 */

import type { BrainContext, BrainResponse, CardAction } from './types';
import type { IntentId } from './intents';
import { CAPABILITY_BLURBS } from './intents';
import type { Slots } from './slots';
import { peso, pctOf, pick } from './nlg';
import {
  buildBreakdownCard,
  buildCompareCard,
  buildForecastCard,
  buildCoachCard,
} from './cards';

/** The single optional deep-link chip cards may carry (§10 Q4). */
const OPEN_INSIGHTS: CardAction = {
  label: 'Open Insights',
  target: 'insights',
};

/** A clean example prompt per intent — used as clarify chips and help hints. */
export const EXAMPLE_PROMPTS: Partial<Record<IntentId, string>> = {
  balance: "What's my balance?",
  income: 'How much did I earn this month?',
  spend: 'How much did I spend?',
  breakdown: 'Give me a spending breakdown',
  topCategory: "What's my biggest expense?",
  compare: 'Compare to last month',
  cut: 'Where can I cut back?',
  savings: 'Am I on track to save?',
  coach: 'How am I doing this month?',
  overspend: 'Am I overspending anywhere?',
};

const FALLBACK_FOLLOWUPS = [
  "What's my balance?",
  'Give me a spending breakdown',
  'Where can I cut back?',
];

// ─── Chit-chat (no context needed) ───────────────────────────────────────────

export function answerGreeting(seed: string): BrainResponse {
  return {
    text: pick(
      [
        'Hey! How can I help with your money today? 👋',
        'Hello! Ask me about your spending, balance, or savings. 💸',
        'Kumusta! What would you like to know about your finances?',
      ],
      seed
    ),
    followUps: ["What's my balance?", 'How much did I spend this month?'],
  };
}

export function answerThanks(seed: string): BrainResponse {
  return {
    text: pick(
      ['Anytime! 🙌', 'You got it. 😊', 'Walang anuman! Glad to help.'],
      seed
    ),
  };
}

export function answerHelp(): BrainResponse {
  const lines = CAPABILITY_BLURBS.map((b) => `• ${b}`).join('\n');
  return {
    text: `I'm Fino — your offline money assistant. I can:\n${lines}\n\nYou can also just type an expense like "lunch 120 via gcash" and I'll log it.`,
    followUps: ["What's my balance?", 'Give me a spending breakdown'],
  };
}

export function answerCount(): BrainResponse {
  return {
    text: "I can't count individual purchases here yet — but the Insights tab spots your repeat habits (how often a merchant shows up and what it costs you a month).",
    followUps: ['Give me a spending breakdown', "What's my biggest expense?"],
  };
}

// ─── Data answers (need BrainContext) ────────────────────────────────────────

function answerBalance(ctx: BrainContext, seed: string): BrainResponse {
  return {
    text: pick(
      [
        `You've got ${peso(ctx.balance)} across your accounts right now.`,
        `Your total balance is ${peso(ctx.balance)}.`,
      ],
      seed
    ),
    followUps: ['How much did I spend this month?', 'Am I on track to save?'],
  };
}

function answerIncome(ctx: BrainContext): BrainResponse {
  if (ctx.income <= 0) {
    return {
      text: "You haven't logged any income this month yet. Add it and I'll track your savings rate from there.",
      followUps: ['Give me a spending breakdown'],
    };
  }
  return {
    text: `You've earned ${peso(ctx.income)} this month.`,
    followUps: ['How much did I spend this month?', 'Am I on track to save?'],
  };
}

function answerSpend(
  ctx: BrainContext,
  slots: Slots,
  seed: string
): BrainResponse {
  const followUps = ['Give me a spending breakdown', 'Compare to last month'];

  // Category-scoped: "how much on food" — answerable for THIS month only, from
  // the by-category breakdown we hold.
  if (
    slots.category &&
    (!slots.timeRange || slots.timeRange.key === 'thisMonth')
  ) {
    const match = ctx.topCategories.find(
      (c) =>
        c.name.toLowerCase() === slots.category!.label.toLowerCase() ||
        c.name.toLowerCase() === slots.category!.keyword.toLowerCase()
    );
    if (match) {
      return {
        text: `You've spent ${peso(match.amount)} on ${match.name} this month.`,
        followUps,
      };
    }
    return {
      text: `I don't see any ${slots.category.label} spending logged this month yet.`,
      followUps,
    };
  }

  // Last month total.
  if (slots.timeRange?.key === 'lastMonth') {
    if (ctx.lastMonthSpent <= 0) {
      return {
        text: "I don't have any spending logged for last month.",
        followUps,
      };
    }
    return {
      text: `You spent ${peso(ctx.lastMonthSpent)} last month.`,
      followUps,
    };
  }

  // Sub-month windows aren't in the chat context — be honest, don't guess.
  if (slots.timeRange && slots.timeRange.key !== 'thisMonth') {
    return {
      text: `In chat I track spending by month — this month you're at ${peso(
        ctx.spent
      )} so far. For a ${slots.timeRange.label} view, open the Insights tab.`,
      followUps,
    };
  }

  // Plain "how much did I spend" → this month.
  return {
    text: pick(
      [
        `You've spent ${peso(ctx.spent)} this month.`,
        `So far this month you're at ${peso(ctx.spent)} in expenses.`,
      ],
      seed
    ),
    followUps,
  };
}

function answerBreakdown(ctx: BrainContext): BrainResponse {
  const followUps = ['Compare to last month', 'Where can I cut back?'];
  if (!ctx.topCategories.length) {
    return {
      text: "You haven't logged any spending this month yet. Once you do, I'll break it down by category for you.",
      followUps,
    };
  }
  const lines = ctx.topCategories
    .slice(0, 4)
    .map((c) => `• ${c.name} — ${peso(c.amount)}`)
    .join('\n');
  const data = buildBreakdownCard(ctx);
  return {
    text: `You've spent ${peso(ctx.spent)} this month. Here's where it went:\n${lines}`,
    card: data ? { kind: 'breakdown', data } : undefined,
    followUps,
  };
}

function answerTopCategory(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  if (!ctx.topCategories.length) {
    return {
      text: "You haven't logged any spending this month yet, so I can't name a biggest category.",
      followUps,
    };
  }
  const top = ctx.topCategories[0];
  return {
    text: `Your biggest spending this month is ${top.name} at ${peso(
      top.amount
    )} — ${pctOf(top.amount, ctx.spent)}% of everything you've spent.`,
    followUps,
  };
}

function answerCompare(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  if (ctx.lastMonthSpent <= 0) {
    return {
      text: `I don't have last month's spending to compare against yet. So far this month you've spent ${peso(
        ctx.spent
      )} — check back next month and I'll show you the trend.`,
      followUps,
    };
  }
  const data = buildCompareCard(ctx);
  const card = data ? ({ kind: 'compare', data } as const) : undefined;
  const diff = ctx.spent - ctx.lastMonthSpent;
  const pct = pctOf(Math.abs(diff), ctx.lastMonthSpent);
  if (diff < 0) {
    return {
      text: `You're spending less this month — ${peso(ctx.spent)} vs ${peso(
        ctx.lastMonthSpent
      )} last month, down ${pct}%. Nice work. 📉`,
      card,
      followUps,
    };
  }
  if (diff > 0) {
    return {
      text: `You're spending more this month — ${peso(ctx.spent)} vs ${peso(
        ctx.lastMonthSpent
      )} last month, up ${pct}%. Want to see where it's going?`,
      card,
      followUps,
    };
  }
  return {
    text: `You're right on pace — ${peso(
      ctx.spent
    )} this month, the same as last month.`,
    card,
    followUps,
  };
}

function answerCut(ctx: BrainContext): BrainResponse {
  const followUps = ['Compare to last month', 'Am I on track to save?'];
  if (!ctx.topCategories.length) {
    return {
      text: "You haven't logged enough spending this month for me to spot where to cut. Log a few expenses and ask me again.",
      followUps,
    };
  }
  const top = ctx.topCategories[0];
  const save15 = top.amount * 0.15;
  return {
    text: `Your biggest spend this month is ${top.name} at ${peso(
      top.amount
    )}. Trimming it by just 15% would save you about ${peso(
      save15
    )} a month. Want to keep an eye on it?`,
    followUps,
  };
}

function answerSavings(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  if (ctx.income <= 0) {
    return {
      text: "You haven't logged any income this month yet, so I can't forecast your savings. Add your income and I'll project where you'll land.",
      followUps,
    };
  }
  // The forecast card narrates the trajectory math when there's enough data
  // (sufficiency-gated inside buildForecastCard); otherwise the reply degrades
  // to text only (FINO_CHATBOT_CARDS.md §9).
  const fcData = buildForecastCard(ctx);
  const card = fcData
    ? ({ kind: 'forecast', data: fcData, action: OPEN_INSIGHTS } as const)
    : undefined;

  const saved = Math.max(0, ctx.income - ctx.spent);
  if (saved <= 0) {
    return {
      text: `Heads up — you've spent more than you've earned this month so far (${peso(
        ctx.spent
      )} out vs ${peso(ctx.income)} in). Want to find where to cut back?`,
      card,
      followUps,
    };
  }
  const rate = pctOf(saved, ctx.income);
  const projectedSpend =
    ctx.dayOfMonth > 0
      ? (ctx.spent / ctx.dayOfMonth) * ctx.daysInMonth
      : ctx.spent;
  // When the current daily pace would outrun income by month-end, don't pair an
  // upbeat "₱0 saved 🎯" with the positive rate — narrate the caution honestly.
  if (projectedSpend >= ctx.income) {
    return {
      text: `You've saved ${peso(saved)} so far this month (about ${rate}% of your income), but at your current pace you're on track to spend ${peso(
        projectedSpend
      )} — more than you've earned. Easing off now would lock those savings in.`,
      card,
      followUps,
    };
  }
  const projectedSaved = ctx.income - projectedSpend;
  return {
    text: `You're saving ${peso(saved)} so far this month — about ${rate}% of your income. At this pace you'll finish the month around ${peso(
      projectedSaved
    )} saved. 🎯`,
    card,
    followUps,
  };
}

function answerCoach(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Am I overspending anywhere?'];
  const ins = ctx.insights;
  if (!ins) {
    // No engine insights yet → degrade to a lightweight nudge off the context.
    if (!ctx.topCategories.length) {
      return {
        text: "Log a few expenses this month and I'll coach you on where your money's going and how to tighten up.",
        followUps,
      };
    }
    const top = ctx.topCategories[0];
    return {
      text: `Your biggest spend this month is ${top.name} at ${peso(
        top.amount
      )}. Keep an eye on it and you'll free up room to save.`,
      followUps,
    };
  }
  const data = buildCoachCard(ins);
  return {
    text: ins.coach.message,
    card: { kind: 'coach', data, action: OPEN_INSIGHTS },
    followUps,
  };
}

function answerOverspend(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Give me a spending breakdown', 'Where can I cut back?'];
  const ins = ctx.insights;
  const focusLabel = slots.category?.label;

  if (!ins) {
    return {
      text: focusLabel
        ? `I can't check ${focusLabel} against your usual yet — open the Insights tab for the full anomaly view.`
        : "I track overspending against your 3-month baseline in the Insights tab — open it and I'll flag any category running hot.",
      followUps,
    };
  }

  const focus = focusLabel?.toLowerCase();
  const focused = focus
    ? ins.anomalies.find((a) => a.category.toLowerCase() === focus)
    : undefined;

  // A specific category was asked about and it's within its normal range.
  if (focus && !focused) {
    return {
      text: `Your ${focusLabel} spending looks normal this month — it's tracking close to your usual. 👍`,
      followUps,
    };
  }

  if (!ins.anomalies.length) {
    return {
      text: "Nothing's running hot this month — your categories are all tracking near their usual levels. 👍",
      followUps,
    };
  }

  const data = buildCoachCard(ins, { focusCategory: focusLabel });
  const worst =
    focused ?? [...ins.anomalies].sort((a, b) => b.pctOver - a.pctOver)[0];
  const overPct = Math.round(worst.pctOver * 100);
  return {
    text: `Yes — your ${worst.category} spending is about ${overPct}% over your usual (${peso(
      worst.current
    )} vs ${peso(worst.baseline)}). Worth easing off there.`,
    card: { kind: 'coach', data, action: OPEN_INSIGHTS },
    followUps,
  };
}

/** Generic "I didn't catch that" reply with example prompts. */
export function answerFallback(): BrainResponse {
  return {
    text: "I didn't quite catch that. I can talk about your balance, spending, savings, or log an expense for you — try one of these:",
    followUps: FALLBACK_FOLLOWUPS,
  };
}

/**
 * Clarify between two close intents. Offers both phrasings as tappable chips so
 * the user resolves the ambiguity with one tap instead of retyping.
 */
export function answerClarify(a: IntentId, b: IntentId): BrainResponse {
  const optA = EXAMPLE_PROMPTS[a];
  const optB = EXAMPLE_PROMPTS[b];
  const chips = [optA, optB].filter((s): s is string => Boolean(s));
  return {
    text: 'Want to make sure I get this right — which did you mean?',
    followUps: chips.length === 2 ? chips : FALLBACK_FOLLOWUPS,
  };
}

/**
 * Resolve a data intent against the context. Returns null when the intent
 * isn't a data intent handled here (caller deals with chit-chat / fallback).
 */
export function answerDataIntent(
  intent: IntentId,
  slots: Slots,
  ctx: BrainContext,
  seed: string
): BrainResponse | null {
  switch (intent) {
    case 'balance':
      return answerBalance(ctx, seed);
    case 'income':
      return answerIncome(ctx);
    case 'spend':
      return answerSpend(ctx, slots, seed);
    case 'breakdown':
      return answerBreakdown(ctx);
    case 'topCategory':
      return answerTopCategory(ctx);
    case 'compare':
      return answerCompare(ctx);
    case 'cut':
      return answerCut(ctx);
    case 'savings':
      return answerSavings(ctx);
    case 'coach':
      return answerCoach(ctx);
    case 'overspend':
      return answerOverspend(ctx, slots);
    default:
      return null;
  }
}
