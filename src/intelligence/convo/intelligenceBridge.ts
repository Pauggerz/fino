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

import type {
  BrainContext,
  BrainResponse,
  CardAction,
  TxLite,
  DeltaDirection,
} from './types';
import type { IntentId } from './intents';
import { CAPABILITY_BLURBS } from './intents';
import type { Slots, CategorySlot } from './slots';
import type { TimeRange } from '../core/time';
import { analyzeTransactionText } from '../categorize/categorize';
import { peso, pctOf, pick, capWord, fmtDate, MONTHS_ABBR } from './nlg';
import {
  buildBreakdownCard,
  buildCompareCard,
  buildForecastCard,
  buildCoachCard,
  buildTxListCard,
  buildStatusCard,
  buildSummaryCard,
  buildBudgetCard,
  buildNeedsWantsCard,
  buildPatternCard,
} from './cards';
import {
  selectTx,
  sortByDateDesc,
  take,
  sumAmount,
  maxBy,
  matchMerchant,
  groupByCategory,
  groupByDayOfWeek,
  groupByMonth,
  type DateRange,
} from './query';
import { summarizeNeedsWants } from './needsWants';
import {
  answerSubscriptionCut,
  answerEmergencyFund,
  answerGoalPlan,
  answerBonusAdvice,
  answerImproveSavings,
  answerCutAmount,
  answerRuleOfThumb,
  answerImpulseTips,
  answerAfford,
  answerSafeToSpend,
  answerRunway,
} from './advice';
import {
  answerReCategorize,
  answerSplitBill,
  answerSetBudget,
  answerDeleteTransaction,
  answerTransfer,
  answerReminder,
} from './mutate';

/** The single optional deep-link chip cards may carry (§10 Q4). */
const OPEN_INSIGHTS: CardAction = {
  kind: 'navigate',
  label: 'Open Insights',
  target: 'insights',
};
const OPEN_UTANG: CardAction = {
  kind: 'navigate',
  label: 'Open Utang Tracker',
  target: 'utangTracker',
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
  transactions: 'Show me my last five transactions',
  categoryOf: 'Which category was my Spotify payment?',
  salaryStatus: 'Did my salary hit yet?',
  billStatus: 'Did I pay my internet bill?',
  summary: 'Summarize my spending for Q1',
  budgetStatus: 'Am I on track to stay under my budget?',
  needsVsWants: 'Show me my needs vs my wants',
  dowPattern: 'What day do I spend the most?',
  incomeShare: 'What percent of my income goes to rent?',
  trend: 'Is my transport spending trending up?',
  typicalSpend: 'How much do I typically spend on coffee?',
  subscriptionCut: 'How can I cut my subscription costs?',
  emergencyFund: 'Help me build an emergency fund',
  goalPlan: 'I want to save for a new laptop',
  bonusAdvice: 'What should I do with my bonus?',
  improveSavings: 'How can I improve my savings rate?',
  cutAmount: 'Where can I cut ₱2,000 this month?',
  ruleOfThumb: 'A good rule of thumb for budgeting?',
  impulseTips: 'Tips to avoid impulse buying',
  afford: 'Can I afford a ₱2,000 dinner?',
  debt: 'How much am I owed?',
  safeToSpend: 'How much is safe to spend?',
  reCategorize: 'Move my Grab ride to Transport',
  splitBill: 'Split the bill with friends',
  runway: 'How long will my money last?',
  explainSpend: 'Why is my spending so high this month?',
  monthPattern: 'What was my most expensive month?',
  upcomingBills: 'What bills are coming up?',
  setBudget: 'Set a ₱5,000 budget for food',
  deleteTransaction: 'Delete my last transaction',
  transfer: 'Transfer ₱500 from GCash to BPI',
  reminder: 'Remind me to pay my electric bill',
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

/**
 * "How many times did I buy coffee this month?" / "how often do I order Grab?"
 * — a frequency tally over the snapshot. Prefers a merchant/keyword text match
 * (so "coffee" catches Starbucks rows the category may not), then falls back to
 * the category set. Defaults to this month; honours an explicit range.
 */
function answerCount(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = [
    'Give me a spending breakdown',
    "What's my biggest expense?",
  ];
  const txns = ctx.transactions ?? [];
  const term = slots.merchant ?? slots.category?.keyword;

  // Need a subject to count.
  if (!term && !slots.category) {
    return {
      text: 'Tell me what to count — like "how many times did I buy coffee this month" — and I\'ll tally it up.',
      followUps,
    };
  }
  if (!txns.length) {
    return {
      text: "I don't have your transactions loaded yet, so I can't count those purchases. Give it a moment and try again.",
      followUps,
    };
  }

  const tr = slots.timeRange;
  const range = slotRange(slots) ?? thisMonthRange(ctx);
  const when = tr ? whenPhrase(tr) : 'this month';
  const base = selectTx(txns, { range, type: 'expense' });

  // Try the merchant/keyword text first (catches "coffee" → "Starbucks Coffee"),
  // then fall back to the category set when the text match finds nothing.
  let matched = term ? matchMerchant(base, term) : [];
  let subj = term ? capWord(term) : '';
  if (!matched.length && slots.category) {
    const cats = (slotCats(slots, txns) ?? []).map((c) => c.toLowerCase());
    matched = base.filter((t) =>
      cats.includes((t.category ?? '').toLowerCase())
    );
    subj = slots.category.label;
  }

  const note = tr ? coverageNote(ctx, tr) : '';
  const n = matched.length;
  if (n === 0) {
    return {
      text: `I don't see any ${subj || 'matching'} purchases ${when}.${note}`,
      followUps,
    };
  }
  const total = sumAmount(matched);
  return {
    text: `You have ${n} ${subj} purchase${n === 1 ? '' : 's'} ${when} — ${peso(
      total
    )} total.${note}`,
    card: {
      kind: 'txList',
      data: buildTxListCard(
        `${subj} · ${n}×`,
        take(sortByDateDesc(matched), 5),
        { total, matchCount: n }
      ),
    },
    followUps,
  };
}

// ─── Data answers (need BrainContext) ────────────────────────────────────────

function answerBalance(ctx: BrainContext, seed: string): BrainResponse {
  const accts = ctx.accounts ?? [];
  const followUps = [
    'How much did I spend this month?',
    'Am I on track to save?',
  ];

  // Per-account breakdown when there's more than one account.
  if (accts.length > 1) {
    const lines = [...accts]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 6)
      .map((a) => `• ${a.name} — ${peso(a.balance)}`)
      .join('\n');
    return {
      text: `You've got ${peso(ctx.balance)} across ${accts.length} accounts:\n${lines}`,
      actions: [
        { kind: 'navigate', label: 'Open Accounts', target: 'accounts' },
      ],
      followUps,
    };
  }
  return {
    text: pick(
      [
        `You've got ${peso(ctx.balance)} across your accounts right now.`,
        `Your total balance is ${peso(ctx.balance)}.`,
      ],
      seed
    ),
    followUps,
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
  const tr = slots.timeRange;
  const txns = ctx.transactions ?? [];

  // "did I spend more on food or transport" — an explicit category pair is a
  // comparison, not a single total; both numbers answer either reading.
  if (slots.category && slots.categoryB) return answerCompare(ctx, slots);

  // Category-scoped, this-month: answer from the by-category aggregate we hold.
  if (slots.category && (!tr || tr.key === 'thisMonth')) {
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

  // Last-month TOTAL (no category scope) comes from the authoritative monthly
  // aggregate. A category-scoped "food last month" — including the multi-turn
  // "how much on food?" → "what about last month?" follow-up — must NOT land
  // here; it falls through to the snapshot slice below so the category is honored.
  if (tr?.key === 'lastMonth' && !slots.category) {
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

  // Any other concrete range (last month with a category, today / a week / a
  // quarter / "last 7 days" / a weekday …) is answered precisely from the
  // transaction snapshot — no more silently collapsing sub-month windows or
  // category-scoped ranges to the month total.
  if (tr && tr.key !== 'thisMonth') {
    const when = whenPhrase(tr);
    if (txns.length) {
      const total = sumAmount(
        selectTx(txns, {
          range: { start: tr.start, end: tr.end },
          type: 'expense',
          categories: slotCats(slots, txns),
        })
      );
      const note = coverageNote(ctx, tr);
      const subj = slots.category ? ` on ${slots.category.label}` : '';
      if (total <= 0) {
        return {
          text: `I don't see any${subj || ' spending'} ${when}.${note}`,
          followUps,
        };
      }
      return {
        text: `You spent ${peso(total)}${subj} ${when}.${note}`,
        followUps,
      };
    }
    // No snapshot to slice — be honest rather than guess a number.
    return {
      text: `In chat I track spending by month — this month you're at ${peso(
        ctx.spent
      )} so far. For a ${tr.label} view, open the Insights tab.`,
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

function answerBreakdown(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Compare to last month', 'Where can I cut back?'];
  const agg = expenseAggForSlots(ctx, slots);
  // Narration scope: the asked-for window when we sliced one, else "this month".
  const when = agg.range ? whenPhrase(agg.range) : 'this month';

  if (!agg.categories.length) {
    return {
      text: agg.windowed
        ? `I don't see any spending ${when}.`
        : "You haven't logged any spending this month yet. Once you do, I'll break it down by category for you.",
      followUps,
    };
  }
  const lines = agg.categories
    .slice(0, 4)
    .map((c) => `• ${c.name} — ${peso(c.amount)}`)
    .join('\n');
  // The vs-last-month delta card only makes sense for the month view; a windowed
  // breakdown ships a card built from its own segments (no cross-period delta).
  const data = agg.windowed
    ? {
        total: agg.total,
        segments: agg.categories.slice(0, 4).map((c, i) => ({
          label: c.name,
          amount: c.amount,
          role: `cat-${i}`,
        })),
      }
    : buildBreakdownCard(ctx);
  return {
    text: `You spent ${peso(agg.total)} ${when}. Here's where it went:\n${lines}${
      agg.windowed ? coverageNote(ctx, agg.range) : ''
    }`,
    card: data ? { kind: 'breakdown', data } : undefined,
    followUps,
  };
}

function answerTopCategory(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  const agg = expenseAggForSlots(ctx, slots);
  const when = agg.range ? whenPhrase(agg.range) : 'this month';

  if (!agg.categories.length) {
    return {
      text: agg.windowed
        ? `I don't see any spending ${when}, so there's no biggest category to name.`
        : "You haven't logged any spending this month yet, so I can't name a biggest category.",
      followUps,
    };
  }
  const top = agg.categories[0];
  return {
    text: `Your biggest spending ${when} is ${top.name} at ${peso(
      top.amount
    )} — ${pctOf(top.amount, agg.total)}% of everything you spent.${
      agg.windowed ? coverageNote(ctx, agg.range) : ''
    }`,
    followUps,
  };
}

function answerCompare(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  const txns = ctx.transactions ?? [];

  // Category-VS-category ("food vs transport") — compare the two categories
  // over the asked-for window (default this month), not this-vs-last month.
  if (slots.category && slots.categoryB) {
    const a = slots.category;
    const b = slots.categoryB;
    const range = slotRange(slots) ?? thisMonthRange(ctx);
    const when = slots.timeRange ? whenPhrase(slots.timeRange) : 'this month';
    const sumFor = (cat: typeof a): number => {
      if (txns.length) {
        return sumAmount(
          selectTx(txns, {
            range,
            type: 'expense',
            categories: catNames(cat, txns),
          })
        );
      }
      // No snapshot → fall back to the this-month aggregate.
      return (
        ctx.topCategories.find(
          (c) => c.name.toLowerCase() === cat.label.toLowerCase()
        )?.amount ?? 0
      );
    };
    const amtA = sumFor(a);
    const amtB = sumFor(b);
    if (amtA <= 0 && amtB <= 0) {
      return {
        text: `I don't see any ${a.label} or ${b.label} spending ${when} to compare.`,
        followUps,
      };
    }
    const note = slots.timeRange ? coverageNote(ctx, slots.timeRange) : '';
    const diff = amtA - amtB;
    const dir: DeltaDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const card = {
      kind: 'compare' as const,
      data: {
        currentLabel: a.label,
        previousLabel: b.label,
        current: amtA,
        previous: amtB,
        pct: pctOf(
          Math.abs(diff),
          Math.min(amtA, amtB) || Math.max(amtA, amtB)
        ),
        direction: dir,
      },
    };
    let text: string;
    if (diff === 0) {
      text = `Dead even — ${peso(amtA)} on ${a.label} and on ${b.label} ${when}.${note}`;
    } else {
      const hi = diff > 0 ? a.label : b.label;
      text = `${hi} wins ${when} — ${peso(amtA)} on ${a.label} vs ${peso(
        amtB
      )} on ${b.label} (${peso(Math.abs(diff))} apart, ${peso(
        amtA + amtB
      )} together).${note}`;
    }
    return { text, card, followUps };
  }

  // Category-scoped compare ("dining vs last month") when we have a snapshot to
  // pull both months from. Falls back to the total comparison below otherwise.
  if (slots.category && txns.length) {
    const cats = slotCats(slots, txns);
    const { label } = slots.category;
    const thisM = sumAmount(
      selectTx(txns, {
        range: thisMonthRange(ctx),
        type: 'expense',
        categories: cats,
      })
    );
    const lastM = sumAmount(
      selectTx(txns, {
        range: lastMonthRange(ctx),
        type: 'expense',
        categories: cats,
      })
    );
    if (thisM > 0 || lastM > 0) {
      const diff = thisM - lastM;
      const pct = pctOf(Math.abs(diff), lastM || thisM);
      const dir: DeltaDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const card = {
        kind: 'compare' as const,
        data: {
          currentLabel: 'This month',
          previousLabel: 'Last month',
          current: thisM,
          previous: lastM,
          pct,
          direction: dir,
        },
      };
      let text: string;
      if (lastM <= 0) {
        text = `You've spent ${peso(thisM)} on ${label} this month — nothing logged last month to compare against.`;
      } else if (diff > 0) {
        text = `Yes — you're spending more on ${label}: ${peso(thisM)} this month vs ${peso(lastM)} last month, up ${pct}%.`;
      } else if (diff < 0) {
        text = `You're spending less on ${label}: ${peso(thisM)} this month vs ${peso(lastM)} last month, down ${pct}%. 📉`;
      } else {
        text = `Your ${label} spending is flat — ${peso(thisM)} both months.`;
      }
      return { text, card, followUps };
    }
    return {
      text: `I don't see any ${label} spending this month or last to compare.`,
      followUps,
    };
  }

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

function answerSavings(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];

  // Range-scoped savings ("how much have I saved this year / in Q1") — net
  // income − expense over the asked-for window, sliced from the snapshot.
  const tr = slots.timeRange;
  const txns = ctx.transactions ?? [];
  if (tr && tr.key !== 'thisMonth' && txns.length) {
    const range = { start: tr.start, end: tr.end };
    const income = sumAmount(selectTx(txns, { range, type: 'income' }));
    const expense = sumAmount(selectTx(txns, { range, type: 'expense' }));
    const when = whenPhrase(tr);
    if (income <= 0 && expense <= 0) {
      return {
        text: `I don't see any activity ${when} to work out savings from.`,
        followUps,
      };
    }
    const note = coverageNote(ctx, tr);
    const saved = income - expense;
    if (saved >= 0) {
      const rateBit =
        income > 0
          ? ` — about ${pctOf(saved, income)}% of what you earned`
          : '';
      return {
        text: `You've saved ${peso(saved)} ${when} (${peso(income)} in, ${peso(
          expense
        )} out)${rateBit}.${note}`,
        followUps,
      };
    }
    return {
      text: `You're ${peso(-saved)} in the red ${when} — ${peso(
        expense
      )} out against ${peso(income)} in.${note}`,
      followUps,
    };
  }

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
  return {
    text: `Yes — ${anomalyClause(worst)}. Worth easing off there.`,
    card: { kind: 'coach', data, action: OPEN_INSIGHTS },
    followUps,
  };
}

/**
 * Narrate one anomaly. A "% over usual" only reads sensibly against a material
 * baseline — against a near-zero usual (₱50) the percentage explodes into noise
 * ("6283% over"). So below a baseline floor, or when the percentage is extreme,
 * we lead with the absolute amount instead of the runaway ratio.
 */
function anomalyClause(a: {
  category: string;
  current: number;
  baseline: number;
  pctOver: number;
}): string {
  const overPct = Math.round(a.pctOver * 100);
  if (a.baseline < 500 || overPct > 300) {
    return `you've spent ${peso(a.current)} on ${a.category} this month — well above your usual ${peso(a.baseline)}`;
  }
  return `your ${a.category} spending is about ${overPct}% over your usual (${peso(a.current)} vs ${peso(a.baseline)})`;
}

// ─── Category 1: transaction info & mapping (V3) ─────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
function txLabelOf(t: TxLite): string {
  return (
    t.name?.trim() ||
    t.merchant?.trim() ||
    t.category?.trim() ||
    'a transaction'
  );
}
function ctxNow(ctx: BrainContext): Date {
  return ctx.now ? new Date(ctx.now) : new Date();
}
function thisMonthRange(ctx: BrainContext): DateRange {
  const n = ctxNow(ctx);
  return {
    start: new Date(n.getFullYear(), n.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}
function slotRange(slots: Slots): DateRange | undefined {
  return slots.timeRange
    ? { start: slots.timeRange.start, end: slots.timeRange.end }
    : undefined;
}
/**
 * Concrete category names to filter a snapshot slice by for one category slot.
 * A user-named category matches literally ([label, keyword]); a bare master
 * bucket (the slot fell back to "Food"/"Transport" because the user has no
 * category by that name) broadens to every granular sibling in the snapshot that
 * maps to the same taxonomy master — so "how much on food last week" still
 * catches the user's Groceries/Dining rows instead of silently returning ₱0.
 */
function catNames(cat: CategorySlot, txns?: TxLite[]): string[] {
  const base = Array.from(new Set([cat.label, cat.keyword].filter(Boolean)));
  if (cat.userNamed || !txns?.length) return base;
  const seen = new Set(base.map((s) => s.toLowerCase()));
  const out = [...base];
  for (const t of txns) {
    const name = (t.category ?? '').trim();
    const lc = name.toLowerCase();
    if (name && !seen.has(lc)) {
      seen.add(lc);
      if (analyzeTransactionText(name).suggestedCategory === cat.master)
        out.push(name);
    }
  }
  return out;
}

function slotCats(slots: Slots, txns?: TxLite[]): string[] | undefined {
  return slots.category ? catNames(slots.category, txns) : undefined;
}
/** Human suffix for narration: " tagged Entertainment over ₱5,000 this year". */
function scopeLabel(slots: Slots): string {
  const bits: string[] = [];
  if (slots.category) bits.push(`tagged ${slots.category.label}`);
  if (slots.merchant) bits.push(`for ${capWord(slots.merchant)}`);
  if (slots.amountMin != null && slots.amountMax != null) {
    bits.push(`between ${peso(slots.amountMin)} and ${peso(slots.amountMax)}`);
  } else if (slots.amountMin != null)
    bits.push(`over ${peso(slots.amountMin)}`);
  else if (slots.amountMax != null) bits.push(`under ${peso(slots.amountMax)}`);
  if (slots.timeRange) bits.push(slots.timeRange.label);
  return bits.length ? ` ${bits.join(' ')}` : '';
}

function fmtDateYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Honest-coverage caveat (B2). The snapshot is a bounded trailing window — when
 * an answer was sliced from it but the asked-for range starts BEFORE what the
 * snapshot covers, say so instead of silently undercounting ("last year" over a
 * 13-month snapshot would otherwise quietly miss months).
 */
function coverageNote(
  ctx: BrainContext,
  range: { start: Date } | undefined
): string {
  if (!range || !ctx.snapshotStart) return '';
  const cov = Date.parse(ctx.snapshotStart);
  if (!Number.isFinite(cov)) return '';
  if (range.start.getTime() >= cov) return '';
  return ` Heads up: in chat I can only see back to ${fmtDateYear(
    ctx.snapshotStart
  )}, so this misses anything earlier — open Insights for the full picture.`;
}

/** Narration suffix for a resolved range so totals read naturally: "today",
 *  "in March", "on Tuesday", "over the weekend", "in the last 7 days". */
function whenPhrase(tr: TimeRange): string {
  switch (tr.key) {
    case 'weekday':
    case 'daysAgo':
    case 'calendarDate':
      return `on ${tr.label}`;
    case 'weekend':
      return 'over the weekend';
    case 'today':
    case 'yesterday':
    case 'thisWeek':
    case 'lastWeek':
    case 'thisMonth':
    case 'lastMonth':
    case 'thisYear':
    case 'lastYear':
    case 'weeksAgo':
      return tr.label;
    default:
      // quarter / namedMonth / lastNDays / last30Days
      return `in ${tr.label}`;
  }
}

/**
 * Expense aggregation for the window the user actually asked about.
 *
 * The pre-computed `ctx.topCategories` / `ctx.spent` are **this-month only**, so
 * a "this week" / "March" / "this year" follow-up can't be answered from them.
 * When the slots carry a concrete non-this-month range, re-aggregate the
 * injected snapshot (`ctx.transactions`) for that window instead; otherwise fall
 * through to the authoritative month aggregate (cheaper, and covers the whole
 * year even when the snapshot is row-capped).
 *
 * `windowed` is true when we sliced the snapshot for a specific range — callers
 * use it to switch narration from "this month" to the range phrase and to be
 * honest ("nothing logged <range>") rather than borrowing the month total.
 */
type ExpenseAgg = {
  categories: { name: string; amount: number }[];
  total: number;
  /** True when we sliced the snapshot for a concrete non-this-month range. */
  windowed: boolean;
  /** The range we scoped to (only when `windowed`). */
  range?: TimeRange;
};

function expenseAggForSlots(ctx: BrainContext, slots: Slots): ExpenseAgg {
  const tr = slots.timeRange;
  const txns = ctx.transactions ?? [];

  // No range, or plain this-month → the month aggregate is authoritative.
  if (!tr || tr.key === 'thisMonth' || !txns.length) {
    return {
      categories: ctx.topCategories,
      total: ctx.spent,
      windowed: false,
    };
  }

  // Concrete other window → re-aggregate the snapshot for it.
  const scoped = selectTx(txns, {
    range: { start: tr.start, end: tr.end },
    type: 'expense',
    categories: slotCats(slots, txns),
  });
  const buckets = groupByCategory(scoped);
  return {
    categories: buckets.map((b) => ({ name: b.name, amount: b.amount })),
    total: sumAmount(scoped),
    windowed: true,
    range: tr,
  };
}

function answerTransactions(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = [
    'Give me a spending breakdown',
    "What's my biggest expense?",
  ];
  const txns = ctx.transactions ?? [];
  if (!txns.length) {
    return {
      text: "I don't have any transactions to show yet — log a few and I'll pull them up here.",
      followUps,
    };
  }

  const range = slotRange(slots);
  const cats = slotCats(slots, txns);
  const wantsIncome = /\b(income|earned|salary|deposit|received)\b/.test(norm);
  const wantsMax = /\b(highest|biggest|largest|most expensive)\b/.test(norm);

  // A bare "₱1,500 charge" → match that amount within a 2% tolerance window.
  const isChargeLookup =
    slots.amountMin == null &&
    slots.amountMax == null &&
    slots.amounts.length === 1 &&
    (Boolean(range) || /\bcharge\b/.test(norm));

  let { amountMin } = slots;
  let { amountMax } = slots;
  if (isChargeLookup) {
    const a = slots.amounts[0];
    const tol = Math.max(1, a * 0.02);
    amountMin = a - tol;
    amountMax = a + tol;
  }

  const hasFilter = Boolean(
    range || cats || slots.merchant || amountMin != null || amountMax != null
  );
  let type: TxLite['type'] | undefined;
  if (wantsIncome) type = 'income';
  else if (hasFilter || wantsMax) type = 'expense';

  const matched = selectTx(txns, {
    range,
    categories: cats,
    type,
    merchant: slots.merchant,
    amountMin,
    amountMax,
  });
  const sorted = sortByDateDesc(matched);

  // "highest single expense [yesterday]" → the single max row.
  if (wantsMax) {
    const top = maxBy(matched, (t) => t.amount);
    const when = slots.timeRange ? ` ${slots.timeRange.label}` : '';
    if (!top) {
      return { text: `I don't see any expenses${when}.`, followUps };
    }
    return {
      text: `Your highest expense${when} was ${capWord(
        txLabelOf(top)
      )} at ${peso(top.amount)} on ${fmtDate(top.date)}.`,
      card: {
        kind: 'txList',
        data: buildTxListCard(`Highest expense${when}`, [top]),
      },
      followUps,
    };
  }

  // Specific-charge lookup.
  if (isChargeLookup) {
    const asked = slots.amounts[0];
    const when = slots.timeRange ? ` ${slots.timeRange.label}` : '';
    if (!sorted.length) {
      return {
        text: `I don't see a ${peso(asked)} charge${when}. It may be under a different amount or date.`,
        followUps,
      };
    }
    const top = sorted[0];
    return {
      text: `That ${peso(top.amount)} charge${when} was ${capWord(
        txLabelOf(top)
      )}${top.category ? ` (${top.category})` : ''} on ${fmtDate(top.date)}.`,
      card: {
        kind: 'txList',
        data: buildTxListCard(`${peso(asked)} charge${when}`, take(sorted, 5)),
      },
      followUps,
    };
  }

  // List / filter.
  if (!sorted.length) {
    return {
      text: `I couldn't find any transactions${scopeLabel(slots)}. Want a different range?`,
      followUps,
    };
  }

  const total = sumAmount(matched);
  const limit = slots.limit ?? (hasFilter ? 25 : 5);
  const rows = take(sorted, limit);

  let title: string;
  let text: string;
  if (!hasFilter) {
    title = slots.limit
      ? `Last ${slots.limit} transactions`
      : 'Recent transactions';
    text =
      rows.length === 1
        ? 'Here is your latest transaction:'
        : `Here are your last ${rows.length} transactions:`;
  } else {
    title = `Transactions${scopeLabel(slots)}`;
    const n = sorted.length;
    text = `I found ${n} ${n === 1 ? 'transaction' : 'transactions'}${scopeLabel(
      slots
    )}, totaling ${peso(total)}.`;
  }

  return {
    text,
    card: {
      kind: 'txList',
      data: buildTxListCard(title, rows, {
        total: hasFilter ? total : undefined,
        matchCount: sorted.length,
      }),
    },
    followUps,
  };
}

function answerCategoryOf(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = [
    'Give me a spending breakdown',
    'Show me my last five transactions',
  ];
  const txns = ctx.transactions ?? [];
  const term = slots.merchant ?? slots.category?.keyword;

  if (term && txns.length) {
    const matches = sortByDateDesc(matchMerchant(txns, term));
    if (matches.length) {
      const m = matches[0];
      const cat = m.category ?? 'Other';
      return {
        text: `Your ${capWord(term)} ${
          matches.length > 1 ? 'payments fall' : 'payment falls'
        } under ${cat}.`,
        card: {
          kind: 'txList',
          data: buildTxListCard(`${capWord(term)} → ${cat}`, take(matches, 3)),
        },
        followUps,
      };
    }
    return {
      text: `I don't see a ${capWord(term)} transaction in your recent history, so I can't say which category it landed in.`,
      followUps,
    };
  }

  // No specific subject → name the biggest category as a useful fallback.
  if (ctx.topCategories.length) {
    const top = ctx.topCategories[0];
    return {
      text: `Tell me a merchant and I'll find its category — e.g. "which category was my Spotify payment". Your biggest category this month is ${top.name} at ${peso(
        top.amount
      )}.`,
      followUps,
    };
  }
  return {
    text: 'Tell me a merchant — like "which category was my Spotify payment" — and I\'ll tell you where it landed.',
    followUps,
  };
}

function answerSalaryStatus(ctx: BrainContext): BrainResponse {
  const followUps = [
    'How much did I earn this month?',
    'Give me a spending breakdown',
  ];
  const txns = ctx.transactions ?? [];
  const range = thisMonthRange(ctx);
  const income = selectTx(txns, { type: 'income', range });

  const salaryRe = /salary|sweldo|sahod|payroll|paycheck|wage/i;
  const salaryRows = income.filter((t) =>
    salaryRe.test(`${t.category ?? ''} ${t.merchant ?? ''} ${t.name ?? ''}`)
  );
  const got = salaryRows.length ? salaryRows : income;

  if (got.length) {
    const latest = sortByDateDesc(got)[0];
    const total = sumAmount(got);
    return {
      text: `Yes — ${peso(total)} in income came in this month, the latest on ${fmtDate(
        latest.date
      )}.`,
      card: buildStatusCardWrapped({
        yes: true,
        status: 'good',
        title: 'Income received',
        message: `${peso(total)} this month`,
        tx: latest,
      }),
      followUps,
    };
  }

  const expected = ctx.recurringIncome?.[0];
  const when =
    expected?.dayOfMonth != null
      ? ` It usually lands around the ${ordinal(expected.dayOfMonth)}.`
      : '';
  return {
    text: `Not yet — I don't see any income logged this month.${when}`,
    card: buildStatusCardWrapped({
      yes: false,
      status: 'watch',
      title: 'No income yet',
      message: when.trim() || 'Nothing logged this month',
    }),
    actions: [
      {
        kind: 'navigate',
        label: 'Add income',
        target: 'addTransaction',
        params: { mode: 'income' },
      },
    ],
    followUps,
  };
}

function answerBillStatus(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ['Give me a spending breakdown', 'Where can I cut back?'];
  const recurring = ctx.insights?.recurring ?? [];
  const txns = ctx.transactions ?? [];
  const subscriptionsAsked = /\b(subscriptions?|recurring)\b/.test(norm);
  const focus =
    slots.merchant ?? slots.category?.keyword ?? slots.category?.label;

  // "Did I pay my <X> bill?" — a specific bill/merchant.
  if (focus && !subscriptionsAsked) {
    const range = thisMonthRange(ctx);
    const paid = sortByDateDesc(
      matchMerchant(selectTx(txns, { range, type: 'expense' }), focus)
    );
    if (paid.length) {
      const latest = paid[0];
      return {
        text: `Yes — you paid ${capWord(focus)} (${peso(latest.amount)}) on ${fmtDate(
          latest.date
        )}.`,
        card: buildStatusCardWrapped({
          yes: true,
          status: 'good',
          title: `${capWord(focus)} paid`,
          message: `${peso(latest.amount)} this month`,
          tx: latest,
        }),
        followUps,
      };
    }
    const bill = recurring.find((r) =>
      `${r.merchant} ${r.category ?? ''}`
        .toLowerCase()
        .includes(focus.toLowerCase())
    );
    const detail = bill
      ? `It's usually about ${peso(bill.amount)} around the ${ordinal(bill.dayOfMonth)}.`
      : '';
    return {
      text: `I don't see a ${capWord(focus)} payment this month yet.${
        detail ? ` ${detail}` : ''
      }`,
      card: buildStatusCardWrapped({
        yes: false,
        status: 'watch',
        title: `${capWord(focus)} — not yet`,
        message: detail || 'No payment logged this month',
      }),
      actions: [
        { kind: 'navigate', label: 'Set a reminder', target: 'recurringBills' },
      ],
      followUps,
    };
  }

  // List subscriptions / recurring charges.
  if (!recurring.length) {
    return {
      text: "I haven't spotted any recurring subscriptions yet — they show up once a charge repeats across a few months.",
      actions: [
        { kind: 'navigate', label: 'Review bills', target: 'recurringBills' },
      ],
      followUps,
    };
  }
  const sorted = [...recurring].sort((a, b) => b.amount - a.amount);
  const monthlyTotal = sorted.reduce((s, r) => s + r.amount, 0);
  const lines = sorted
    .slice(0, 5)
    .map((r) => `• ${capWord(r.merchant)} — ${peso(r.amount)}/mo`)
    .join('\n');
  return {
    text: `You've got ${recurring.length} recurring ${
      recurring.length === 1 ? 'charge' : 'charges'
    } totaling about ${peso(monthlyTotal)}/mo:\n${lines}`,
    actions: [
      {
        kind: 'navigate',
        label: 'Review subscriptions',
        target: 'recurringBills',
      },
    ],
    followUps,
  };
}

/** Thin wrapper so the bridge builds a `status` card without importing the kind
 *  literal everywhere. */
function buildStatusCardWrapped(args: Parameters<typeof buildStatusCard>[0]) {
  return { kind: 'status' as const, data: buildStatusCard(args) };
}

// ─── Categories 2 & 3: spending patterns & summaries (V3) ────────────────────

const OPEN_CASHFLOW: CardAction = {
  kind: 'navigate',
  label: 'Open Cash Flow',
  target: 'cashFlow',
};

const DOW_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function lastMonthRange(ctx: BrainContext): DateRange {
  const n = ctxNow(ctx);
  return {
    start: new Date(n.getFullYear(), n.getMonth() - 1, 1, 0, 0, 0, 0),
    end: new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59, 999),
  };
}

/** Fraction of the current month elapsed (0..1) — the budget pace reference. */
function monthProgressOf(ctx: BrainContext): number {
  return ctx.daysInMonth > 0
    ? Math.min(1, ctx.dayOfMonth / ctx.daysInMonth)
    : 0;
}

/** Distinct YYYY-M buckets a row set spans (≥1), for monthly averaging. */
function monthsSpanned(txns: TxLite[]): number {
  const keys = new Set<string>();
  for (const t of txns) {
    const d = new Date(t.date);
    if (!Number.isNaN(d.getTime()))
      keys.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  return Math.max(1, keys.size);
}

function answerSummary(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ['Where can I cut back?', 'Am I overspending anywhere?'];
  const txns = ctx.transactions ?? [];
  const range = slotRange(slots) ?? thisMonthRange(ctx);
  const label = slots.timeRange?.label ?? 'this month';
  const isCashFlow = /cash ?flow/.test(norm);

  // Without a snapshot we can only summarize THIS month from the aggregates.
  if (!txns.length) {
    const net = ctx.income - ctx.spent;
    const card = buildSummaryCard({
      label: 'this month',
      income: ctx.income,
      expense: ctx.spent,
      segments: ctx.topCategories,
    });
    return {
      text: `This month: ${peso(ctx.income)} in, ${peso(ctx.spent)} out — ${
        net >= 0 ? `${peso(net)} net saved` : `${peso(-net)} in the red`
      }.`,
      card: { kind: 'summary', data: card },
      actions: isCashFlow ? [OPEN_CASHFLOW, OPEN_INSIGHTS] : [OPEN_INSIGHTS],
      followUps,
    };
  }

  const rangeExpense = selectTx(txns, { range, type: 'expense' });
  const rangeIncome = selectTx(txns, { range, type: 'income' });
  const expense = sumAmount(rangeExpense);
  const income = sumAmount(rangeIncome);
  const net = income - expense;
  const buckets = groupByCategory(rangeExpense);
  const card = buildSummaryCard({ label, income, expense, segments: buckets });

  let extra = '';
  if (/fixed (vs|versus|and) variable/.test(norm)) {
    const recurringMerchants = (ctx.insights?.recurring ?? []).map((r) =>
      r.merchant.toLowerCase()
    );
    let fixed = 0;
    for (const tt of rangeExpense) {
      const hay =
        `${tt.merchant ?? ''} ${tt.name ?? ''} ${tt.category ?? ''}`.toLowerCase();
      if (recurringMerchants.some((m) => m && hay.includes(m)))
        fixed += tt.amount;
    }
    extra = ` Fixed (recurring) ran about ${peso(fixed)}, variable ${peso(
      Math.max(0, expense - fixed)
    )}.`;
  }

  const head = `${capWord(label)}: ${peso(income)} in, ${peso(expense)} out`;
  const tail =
    net >= 0
      ? `${peso(net)} net${income > 0 ? ` (${pctOf(net, income)}% saved)` : ''}.`
      : `${peso(-net)} in the red.`;
  return {
    text: `${head} — ${tail}${extra}`,
    card: { kind: 'summary', data: card },
    actions: isCashFlow ? [OPEN_CASHFLOW, OPEN_INSIGHTS] : [OPEN_INSIGHTS],
    followUps,
  };
}

function answerBudgetStatus(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  const budgets = ctx.budgets ?? [];
  if (!budgets.length) {
    return {
      text: "You haven't set any category budgets yet. Set one and I'll track your pace against it each month.",
      actions: [
        { kind: 'navigate', label: 'Set a budget', target: 'categories' },
      ],
      followUps,
    };
  }

  const txns = ctx.transactions ?? [];
  const monthExpense = selectTx(txns, {
    range: thisMonthRange(ctx),
    type: 'expense',
  });
  const spentFor = (cat: string): number => {
    if (txns.length) {
      return sumAmount(
        monthExpense.filter(
          (t) => (t.category ?? '').toLowerCase() === cat.toLowerCase()
        )
      );
    }
    const m = ctx.topCategories.find(
      (c) => c.name.toLowerCase() === cat.toLowerCase()
    );
    return m?.amount ?? 0;
  };

  const focus = slots.category?.label;
  const focused = budgets.filter((b) =>
    focus ? b.category.toLowerCase() === focus.toLowerCase() : true
  );
  const source = focused.length ? focused : budgets;
  const rows = source.map((b) => ({
    label: b.category,
    spent: spentFor(b.category),
    limit: b.limit,
  }));
  const monthProgress = monthProgressOf(ctx);
  const card = buildBudgetCard(rows, monthProgress);

  // Single, focused category → a direct verdict.
  if (focus && focused.length === 1) {
    const r = card.rows[0];
    const verb =
      r.status === 'over'
        ? `over by ${peso(r.spent - r.limit)}`
        : r.status === 'watch'
          ? 'close to the cap'
          : 'comfortably under';
    return {
      text: `You've spent ${peso(r.spent)} of your ${peso(r.limit)} ${
        r.label
      } budget this month — ${verb}.`,
      card: { kind: 'budget', data: card },
      actions: [
        {
          kind: 'navigate',
          label: 'Edit budget',
          target: 'categories',
          params: { focusCategory: r.label, budgetLimit: r.limit },
        },
      ],
      followUps,
    };
  }

  const over = card.rows.filter((r) => r.status === 'over');
  const watch = card.rows.filter((r) => r.status === 'watch');
  let text: string;
  if (over.length) {
    text = `${over.map((r) => r.label).join(', ')} ${
      over.length === 1 ? 'is' : 'are'
    } over budget this month. Here's where each category stands:`;
  } else if (watch.length) {
    text = `Nothing's over yet, but you're getting close on ${watch
      .map((r) => r.label)
      .join(', ')}. Budget health:`;
  } else {
    text = 'All your budgets are on track this month. 👍';
  }
  return {
    text,
    card: { kind: 'budget', data: card },
    actions: [
      { kind: 'navigate', label: 'Manage budgets', target: 'categories' },
    ],
    followUps,
  };
}

function answerNeedsVsWants(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Give me a spending breakdown', 'Where can I cut back?'];
  const txns = ctx.transactions ?? [];
  const range = slotRange(slots) ?? thisMonthRange(ctx);
  const label = slots.timeRange?.label ?? 'this month';

  const buckets = txns.length
    ? groupByCategory(selectTx(txns, { range, type: 'expense' }))
    : ctx.topCategories.map((c) => ({ name: c.name, amount: c.amount }));

  if (!buckets.length) {
    return {
      text: `I don't see any spending ${label} to split into needs and wants yet.`,
      followUps,
    };
  }

  const split = summarizeNeedsWants(buckets);
  if (split.classified <= 0) {
    return {
      text: `I couldn't confidently sort your ${label} spending into needs vs wants — it's mostly uncategorized.`,
      followUps,
    };
  }
  const card = buildNeedsWantsCard(split);
  const needPct = Math.round(card.needPct * 100);
  const caveat = split.unknown
    ? ` (${peso(split.unknown)} I couldn't classify is left out)`
    : '';
  return {
    text: `Roughly ${needPct}% needs / ${
      100 - needPct
    }% wants ${label} — ${peso(split.need)} on needs vs ${peso(
      split.want
    )} on wants. It's a rough split${caveat}.`,
    card: { kind: 'needsWants', data: card },
    actions: [OPEN_INSIGHTS],
    followUps,
  };
}

/** "weekends vs weekdays" framing — answered as a two-bucket split, not 7 bars. */
const WKND_VS_RE =
  /\bweek ?ends?\b[^.]{0,16}\b(?:vs\.?|versus|or|and|compared to)\b[^.]{0,16}\bweek ?days?\b|\bweek ?days?\b[^.]{0,16}\b(?:vs\.?|versus|or|and|compared to)\b[^.]{0,16}\bweek ?ends?\b/;

/** Count weekend (Sat/Sun) and weekday days in [start, end] — bounded loop, the
 *  snapshot window is at most ~18 months. */
function countDayTypes(
  start: Date,
  end: Date
): { weekend: number; weekday: number } {
  const out = { weekend: 0, weekday: 0 };
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let i = 0; i < 740 && d.getTime() <= end.getTime(); i += 1) {
    if (d.getDay() === 0 || d.getDay() === 6) out.weekend += 1;
    else out.weekday += 1;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function answerDowPattern(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = [
    'Give me a spending breakdown',
    'Am I overspending anywhere?',
  ];
  const txns = ctx.transactions ?? [];
  if (!txns.length) {
    return {
      text: 'I need a bit of transaction history to spot which day you spend most — log a few and ask again.',
      followUps,
    };
  }
  // A long window gives a stable weekday signal, unless the user scoped a range.
  const scoped = selectTx(txns, { range: slotRange(slots), type: 'expense' });
  const dow = groupByDayOfWeek(scoped);

  // Weekend-vs-weekday split. Totals alone mislead (5 weekdays vs 2 weekend
  // days), so the verdict is per-day averages over the observed span.
  if (WKND_VS_RE.test(norm) && scoped.length) {
    const weekendTotal = dow[5].amount + dow[6].amount; // Mon-start: 5=Sat 6=Sun
    const weekdayTotal = dow.slice(0, 5).reduce((s, d) => s + d.amount, 0);
    const dates = scoped
      .map((t) => new Date(t.date).getTime())
      .filter((t) => !Number.isNaN(t));
    const spanStart = slots.timeRange?.start ?? new Date(Math.min(...dates));
    const spanEnd = slots.timeRange?.end ?? ctxNow(ctx);
    const days = countDayTypes(spanStart, spanEnd);
    const perWeekend = weekendTotal / Math.max(1, days.weekend);
    const perWeekday = weekdayTotal / Math.max(1, days.weekday);
    const weekendWins = perWeekend > perWeekday;
    const when = slots.timeRange ? ` ${slots.timeRange.label}` : '';
    const note = slots.timeRange ? coverageNote(ctx, slots.timeRange) : '';
    return {
      text: `Per day, you spend more on ${
        weekendWins ? 'weekends' : 'weekdays'
      }${when} — about ${peso(perWeekend)}/weekend day vs ${peso(
        perWeekday
      )}/weekday (${peso(weekendTotal)} vs ${peso(weekdayTotal)} in total).${note}`,
      card: {
        kind: 'pattern',
        data: buildPatternCard({
          title: 'WEEKENDS VS WEEKDAYS',
          caption: `${weekendWins ? 'Weekends' : 'Weekdays'} run hotter per day`,
          bars: [
            { label: 'Weekend', amount: weekendTotal, highlight: weekendWins },
            { label: 'Weekday', amount: weekdayTotal, highlight: !weekendWins },
          ],
        }),
      },
      followUps,
    };
  }
  const peak = maxBy(dow, (d) => d.amount);
  if (!peak || peak.amount <= 0) {
    return {
      text: "I don't see enough day-to-day spending yet to call your heaviest day.",
      followUps,
    };
  }
  const bars = dow.map((d) => ({
    label: d.label,
    amount: d.amount,
    highlight: d.index === peak.index,
  }));
  const peakName = DOW_FULL[peak.index];
  const when = slots.timeRange ? ` ${slots.timeRange.label}` : '';
  return {
    text: `You spend the most on ${peakName}s — about ${peso(
      peak.amount
    )} total there${when}.`,
    card: {
      kind: 'pattern',
      data: buildPatternCard({
        title: 'SPENDING BY DAY',
        caption: `Heaviest on ${peakName}`,
        bars,
      }),
    },
    followUps,
  };
}

function answerIncomeShare(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Give me a spending breakdown', 'Where can I cut back?'];
  if (ctx.income <= 0) {
    return {
      text: "I don't have any income logged this month, so I can't work out what share a category takes. Add your income and ask again.",
      followUps,
    };
  }
  const cat = slots.category?.label;
  if (!cat) {
    return {
      text: 'Tell me a category — like "what percentage of my income goes to rent" — and I\'ll work out the share.',
      followUps,
    };
  }
  const txns = ctx.transactions ?? [];
  const spend = txns.length
    ? sumAmount(
        selectTx(txns, {
          range: thisMonthRange(ctx),
          type: 'expense',
          categories: slotCats(slots, txns),
        })
      )
    : (ctx.topCategories.find((c) => c.name.toLowerCase() === cat.toLowerCase())
        ?.amount ?? 0);

  if (spend <= 0) {
    return {
      text: `I don't see any ${cat} spending this month, so it's 0% of your income so far.`,
      followUps,
    };
  }
  return {
    text: `About ${pctOf(spend, ctx.income)}% of your income goes to ${cat} — ${peso(
      spend
    )} out of ${peso(ctx.income)} this month.`,
    followUps,
  };
}

function answerTrend(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = [
    'Give me a spending breakdown',
    'Am I overspending anywhere?',
  ];
  const ins = ctx.insights;
  const cat = slots.category?.label;

  // Category trend via week-over-week deltas, when we have them.
  if (cat && ins?.weekDeltas?.length) {
    const wd = ins.weekDeltas.find(
      (d) => d.category.toLowerCase() === cat.toLowerCase()
    );
    if (wd) {
      const dir: DeltaDirection =
        wd.pctChange > 0.02 ? 'up' : wd.pctChange < -0.02 ? 'down' : 'flat';
      const pct = Math.abs(Math.round(wd.pctChange * 100));
      const bars = [
        { label: 'Last wk', amount: wd.prevWeek },
        { label: 'This wk', amount: wd.currentWeek, highlight: true },
      ];
      return {
        text:
          dir === 'flat'
            ? `Your ${cat} spending is holding steady week to week (${peso(
                wd.currentWeek
              )} vs ${peso(wd.prevWeek)}).`
            : `Your ${cat} spending is trending ${dir} — ${peso(
                wd.currentWeek
              )} this week vs ${peso(wd.prevWeek)} last week, ${pct}% ${dir}.`,
        card: {
          kind: 'pattern',
          data: buildPatternCard({
            title: `${cat.toUpperCase()}, WEEK OVER WEEK`,
            caption: dir === 'flat' ? 'Holding steady' : `Trending ${dir}`,
            bars,
            direction: dir,
          }),
        },
        followUps,
      };
    }
  }

  // Overall direction via the gated 6-month OLS slope.
  if (
    ins?.trendSlope &&
    ins.sufficiency.trendSlope.ok &&
    ins.trendSlope.direction !== 'flat'
  ) {
    const dir = ins.trendSlope.direction;
    return {
      text: `Your overall spending is trending ${dir} over the past few months${
        cat
          ? ` — I don't have a clean ${cat}-only trend yet, but the whole picture is ${dir}`
          : ''
      }. Open Insights for the month-by-month view.`,
      actions: [OPEN_INSIGHTS],
      followUps,
    };
  }

  return {
    text: cat
      ? `I don't have enough history to call your ${cat} trend yet — give it another month or two and I'll spot the direction.`
      : "I don't have enough history to call a clear trend yet. A couple more months of data and I'll spot the direction.",
    actions: [OPEN_INSIGHTS],
    followUps,
  };
}

const DAILY_AVG_RE = /\b(?:daily|per[- ]day|a day|each day)\b/;

function answerTypicalSpend(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ['Give me a spending breakdown', 'Where can I cut back?'];
  const term = slots.merchant;
  const cat = slots.category?.label;

  // "average daily spend" — a per-day average, not the merchant-habit answer.
  if (DAILY_AVG_RE.test(norm)) {
    const txns = ctx.transactions ?? [];
    const tr = slots.timeRange;
    let total: number;
    let days: number;
    let label: string;
    if (tr && txns.length) {
      const end = Math.min(tr.end.getTime(), ctxNow(ctx).getTime());
      total = sumAmount(
        selectTx(txns, {
          range: { start: tr.start, end: new Date(end) },
          type: 'expense',
          categories: cat ? slotCats(slots, txns) : undefined,
        })
      );
      days = Math.max(
        1,
        Math.floor((end - tr.start.getTime()) / 86_400_000) + 1
      );
      label = whenPhrase(tr);
    } else {
      total = cat
        ? (ctx.topCategories.find(
            (c) => c.name.toLowerCase() === cat.toLowerCase()
          )?.amount ?? 0)
        : ctx.spent;
      days = Math.max(1, ctx.dayOfMonth);
      label = 'this month';
    }
    if (total <= 0) {
      return {
        text: `I don't see any${cat ? ` ${cat}` : ''} spending ${label} to average out yet.`,
        followUps,
      };
    }
    const note = tr ? coverageNote(ctx, tr) : '';
    return {
      text: `You're averaging about ${peso(total / days)}/day${
        cat ? ` on ${cat}` : ''
      } ${label} — ${peso(total)} over ${days} day${days === 1 ? '' : 's'}.${note}`,
      followUps,
    };
  }

  // Prefer a detected habit (merchant-level repeat) when it matches the subject.
  const habit = (ctx.insights?.habits ?? []).find((h) => {
    const m = h.merchant.toLowerCase();
    if (term && m.includes(term.toLowerCase())) return true;
    if (cat && (h.category ?? '').toLowerCase() === cat.toLowerCase())
      return true;
    return false;
  });
  if (habit) {
    const visits = Math.round(habit.visitsPerMonth);
    return {
      text: `You typically spend about ${peso(habit.monthlySpend)}/month on ${capWord(
        habit.merchant
      )} — roughly ${visits} visit${visits === 1 ? '' : 's'} at ${peso(
        habit.avgAmount
      )} each (≈${peso(habit.annualized)}/yr).`,
      followUps,
    };
  }

  // Otherwise compute a monthly average from the snapshot for the subject.
  const txns = ctx.transactions ?? [];
  if ((term || cat) && txns.length) {
    let matched = selectTx(txns, {
      type: 'expense',
      categories: cat ? slotCats(slots) : undefined,
    });
    if (term) matched = matchMerchant(matched, term);
    if (matched.length) {
      const months = monthsSpanned(matched);
      const monthly = sumAmount(matched) / months;
      const perMonth = matched.length / months;
      const subj = term ? capWord(term) : cat;
      return {
        text: `You spend about ${peso(monthly)}/month on ${subj} — roughly ${perMonth.toFixed(
          perMonth < 10 ? 1 : 0
        )} times a month across the last ${months} month${
          months === 1 ? '' : 's'
        }.`,
        followUps,
      };
    }
  }

  return {
    text:
      term || cat
        ? `I don't see enough ${term ?? cat} spending to call a typical amount yet.`
        : 'Tell me what to check — like "how much do I typically spend on coffee" — and I\'ll work out your monthly average.',
    followUps,
  };
}

/**
 * "Why is my spending so high?" / "what changed since last month?" — a
 * diagnostic answer: the month-over-month delta plus the categories driving it,
 * with an anomaly callout when the engine flagged one.
 */
function answerExplainSpend(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut back?', 'Give me a spending breakdown'];
  const txns = ctx.transactions ?? [];
  const { spent, lastMonthSpent } = ctx;

  if (spent <= 0) {
    return {
      text: "You haven't logged any spending this month, so there's nothing driving it up — once you log a few expenses I can break down what's behind them.",
      followUps,
    };
  }

  // Per-category this-vs-last-month deltas — the actual drivers.
  let drivers: { name: string; now: number; delta: number }[] = [];
  if (txns.length) {
    const thisB = groupByCategory(
      selectTx(txns, { range: thisMonthRange(ctx), type: 'expense' })
    );
    const lastB = groupByCategory(
      selectTx(txns, { range: lastMonthRange(ctx), type: 'expense' })
    );
    const lastByName = new Map(
      lastB.map((b) => [b.name.toLowerCase(), b.amount])
    );
    drivers = thisB
      .map((b) => ({
        name: b.name,
        now: b.amount,
        delta: b.amount - (lastByName.get(b.name.toLowerCase()) ?? 0),
      }))
      .filter((d) => d.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);
  }

  const diff = spent - lastMonthSpent;
  let head: string;
  if (lastMonthSpent <= 0) {
    head = `You've spent ${peso(spent)} this month (no last-month baseline to compare against yet).`;
  } else if (diff > 0) {
    head = `You've spent ${peso(spent)} this month — ${peso(diff)} (${pctOf(
      diff,
      lastMonthSpent
    )}%) more than last month's ${peso(lastMonthSpent)}.`;
  } else if (diff < 0) {
    head = `Actually trending better — ${peso(spent)} this month vs ${peso(
      lastMonthSpent
    )} last month, down ${pctOf(-diff, lastMonthSpent)}%.`;
  } else {
    head = `You're exactly level with last month at ${peso(spent)}.`;
  }

  const driverLine = drivers.length
    ? ` The biggest movers: ${drivers
        .map((d) => `${d.name} (+${peso(d.delta)})`)
        .join(', ')}.`
    : '';
  const worst = ctx.insights?.anomalies?.length
    ? [...ctx.insights.anomalies].sort((a, b) => b.pctOver - a.pctOver)[0]
    : undefined;
  const anomalyLine = worst ? ` Also, ${anomalyClause(worst)}.` : '';

  const status = diff > 0 ? ('watch' as const) : ('good' as const);
  const card =
    drivers.length > 0
      ? {
          kind: 'coach' as const,
          data: {
            status,
            title: diff > 0 ? "What's driving it" : 'Holding steady',
            message: head,
            reasons: drivers.map((d) => ({
              label: d.name,
              detail: `+${peso(d.delta)} vs last month · ${peso(d.now)} total`,
            })),
          },
          action: OPEN_INSIGHTS,
        }
      : undefined;

  return { text: `${head}${driverLine}${anomalyLine}`, card, followUps };
}

/**
 * "Cheapest / most expensive month" — month-over-month totals from the
 * snapshot. The current (incomplete) month is shown but never crowned, and the
 * answer names the data span so a bounded snapshot can't mislead.
 */
function answerMonthPattern(
  ctx: BrainContext,
  slots: Slots,
  norm: string
): BrainResponse {
  const followUps = ['Compare to last month', 'Give me a spending breakdown'];
  const txns = ctx.transactions ?? [];
  if (!txns.length) {
    return {
      text: 'I need some transaction history to compare your months — log a few expenses and ask again.',
      followUps,
    };
  }
  const range = slotRange(slots);
  const buckets = groupByMonth(selectTx(txns, { range, type: 'expense' }));
  const nowD = ctxNow(ctx);
  const complete = buckets.filter(
    (b) => !(b.year === nowD.getFullYear() && b.month === nowD.getMonth())
  );
  if (complete.length < 2) {
    return {
      text: "I don't have enough full months of data to call a cheapest or priciest month yet — give it another month or two.",
      actions: [OPEN_INSIGHTS],
      followUps,
    };
  }
  const wantsMin = /\b(?:cheapest|least|lowest)\b/.test(norm);
  const minB = complete.reduce((a, b) => (b.amount < a.amount ? b : a));
  const maxB = complete.reduce((a, b) => (b.amount > a.amount ? b : a));
  if (minB === maxB || maxB.amount - minB.amount < 1) {
    return {
      text: `Your months are remarkably even — every full month I can see lands around ${peso(
        maxB.amount
      )}.`,
      followUps,
    };
  }
  const feature = wantsMin ? minB : maxB;
  const bars = buckets.slice(-8).map((b) => ({
    label: b.label,
    amount: b.amount,
    highlight: b.year === feature.year && b.month === feature.month,
  }));
  const note = slots.timeRange
    ? coverageNote(ctx, slots.timeRange)
    : ctx.snapshotStart
      ? ` (counting since ${fmtDateYear(ctx.snapshotStart)})`
      : '';
  const text = wantsMin
    ? `Your cheapest month was ${minB.label} at ${peso(
        minB.amount
      )}; the priciest was ${maxB.label} at ${peso(maxB.amount)}.${note}`
    : `Your most expensive month was ${maxB.label} at ${peso(
        maxB.amount
      )}; the cheapest was ${minB.label} at ${peso(minB.amount)}.${note}`;
  return {
    text,
    card: {
      kind: 'pattern',
      data: buildPatternCard({
        title: 'SPENDING BY MONTH',
        caption: `${wantsMin ? 'Cheapest' : 'Priciest'}: ${feature.label}`,
        bars,
      }),
    },
    followUps,
  };
}

/**
 * "When is my next bill due?" / "what bills are coming up this week?" — from
 * the configured recurring bills (`ctx.recurringBills`). An explicit window
 * filters to it; otherwise the horizon is the next 31 days.
 */
function answerUpcomingBills(ctx: BrainContext, slots: Slots): BrainResponse {
  const followUps = ['Did I pay my internet bill?', 'Where can I cut back?'];
  const setUp: CardAction = {
    kind: 'navigate',
    label: 'Set up bills',
    target: 'recurringBills',
  };
  const all = (ctx.recurringBills ?? []).filter(
    (b) => b.nextDueAt && Number.isFinite(Date.parse(b.nextDueAt))
  );
  if (!all.length) {
    return {
      text: "You haven't set up any recurring bills yet — add them and I'll tell you what's due next (and nag you before it is).",
      actions: [setUp],
      followUps,
    };
  }

  const nowD = ctxNow(ctx);
  const todayStart = new Date(
    nowD.getFullYear(),
    nowD.getMonth(),
    nowD.getDate()
  );
  const horizonEnd = slots.timeRange
    ? slots.timeRange.end
    : new Date(todayStart.getTime() + 31 * 86_400_000);
  const windowStart = slots.timeRange
    ? new Date(Math.max(slots.timeRange.start.getTime(), todayStart.getTime()))
    : todayStart;

  const upcoming = all
    .map((b) => ({ ...b, due: new Date(b.nextDueAt as string) }))
    .filter((b) => b.due >= windowStart && b.due <= horizonEnd)
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const when = slots.timeRange ? whenPhrase(slots.timeRange) : 'soon';
  if (!upcoming.length) {
    const nextAny = all
      .map((b) => ({ ...b, due: new Date(b.nextDueAt as string) }))
      .filter((b) => b.due >= todayStart)
      .sort((a, b) => a.due.getTime() - b.due.getTime())[0];
    const nextBit = nextAny
      ? ` Next up is ${capWord(nextAny.label)} — ${peso(
          nextAny.amount
        )} on ${fmtDate(nextAny.nextDueAt as string)}.`
      : '';
    return {
      text: `Nothing due ${when}.${nextBit}`,
      actions: [
        { kind: 'navigate', label: 'Review bills', target: 'recurringBills' },
      ],
      followUps,
    };
  }

  const next = upcoming[0];
  const total = upcoming.reduce((s, b) => s + b.amount, 0);
  const daysToNext = Math.ceil(
    (next.due.getTime() - nowD.getTime()) / 86_400_000
  );
  const dueWord =
    daysToNext <= 0
      ? 'due today'
      : daysToNext === 1
        ? 'due tomorrow'
        : `due ${fmtDate(next.nextDueAt as string)}`;
  const more =
    upcoming.length > 1
      ? ` Altogether ${upcoming.length} bills (${peso(total)}) are coming up${
          slots.timeRange ? ` ${whenPhrase(slots.timeRange)}` : ''
        }.`
      : '';
  return {
    text: `Your next bill is ${capWord(next.label)} — ${peso(
      next.amount
    )} ${dueWord}.${more}`,
    card: {
      kind: 'coach',
      data: {
        status: daysToNext <= 3 ? 'watch' : 'good',
        title: 'Upcoming bills',
        message: `${peso(total)} due ${when}`,
        reasons: upcoming.slice(0, 3).map((b) => ({
          label: capWord(b.label),
          detail: `${peso(b.amount)} · ${fmtDate(b.nextDueAt as string)}`,
        })),
      },
      actions: [
        { kind: 'navigate', label: 'Review bills', target: 'recurringBills' },
      ],
    },
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
 * Clarify when a clearly-temporal phrase ("lately", "the past few days") was
 * used but didn't resolve to a concrete range — offer common windows as one-tap
 * chips instead of silently assuming "this month" and answering the wrong span.
 */
export function answerTimeClarify(): BrainResponse {
  return {
    text: 'Over what time range? Tap one or tell me the exact dates:',
    followUps: [
      'How much did I spend this week?',
      'How much did I spend in the last 7 days?',
      'How much did I spend this month?',
    ],
  };
}

// Words that can sit where a debtor's name would ("who owes me", "they
// borrowed…") — never a person to stage in the Utang Tracker.
const NOT_A_DEBTOR = new Set([
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'who',
  'whoever',
  'what',
  'that',
  'this',
  'everyone',
  'everybody',
  'someone',
  'somebody',
  'anyone',
  'anybody',
  'nobody',
  'people',
  'money',
  'cash',
  'much',
]);

/**
 * Detect a NEW-receivable statement ("paul owed me 5k", "paul borrowed 5k",
 * "lent paul 500", "loaned 500 to paul") and pull out the debtor + amount.
 * Returns null for question forms ("who owes me?") so they fall through to the
 * normal list answer.
 */
function parseReceivableStatement(
  seed: string,
  slots: Slots
): { debtor: string; amount?: number } | null {
  // "i borrowed…" is the user's own payable — handled by the clarify note.
  if (/\bi\s+(?:borrowed|owe)\b/.test(seed)) return null;
  const m =
    /\b([a-z]+)\s+(?:owes?|owed)\s+me\b/.exec(seed) ??
    /\b([a-z]+)\s+borrowed\b/.exec(seed) ??
    /\b(?:lent|loaned)\s+([a-z]+)\b/.exec(seed) ??
    /\b(?:lent|loaned)\s+(?:₱|php)?\s?[\d,.]+k?\s+to\s+([a-z]+)/.exec(seed);
  if (!m || NOT_A_DEBTOR.has(m[1])) return null;
  const amount = slots.amounts.length ? Math.max(...slots.amounts) : undefined;
  return { debtor: m[1], amount };
}

/**
 * Debt answer. The Utang tracker stores money owed **to** the user
 * (receivables), never their own payables — so every phrasing ("how much do I
 * owe", "who owes me") is answered as money owed *to* them, and a payable-shaped
 * question gets a one-line clarification first so the direction is unambiguous.
 *
 * A statement of a NEW receivable ("Paul owed me 5k") is different: the user is
 * telling us a fact to record, not asking. We never log it as an expense —
 * instead we stage it in the Utang Tracker (prefilled, user confirms there; no
 * silent write).
 */
function answerDebt(
  ctx: BrainContext,
  slots: Slots,
  seed: string
): BrainResponse {
  const followUps = ["What's my balance?", 'Give me a spending breakdown'];
  const debts = (ctx.debts ?? []).filter((d) => d.remaining > 0);

  const stmt = parseReceivableStatement(seed, slots);
  if (stmt) {
    const debtor = stmt.debtor.charAt(0).toUpperCase() + stmt.debtor.slice(1);
    const amountTxt = stmt.amount ? ` ${peso(stmt.amount)}` : ' money';
    const trackAction: CardAction = {
      kind: 'navigate',
      label: 'Add to Utang Tracker',
      target: 'utangTracker',
      params: {
        debtorName: debtor,
        direction: 'owed_to_me',
        ...(stmt.amount ? { amount: stmt.amount } : {}),
      },
    };
    return {
      text: `Sounds like ${debtor} owes you${amountTxt} — that's not an expense, so I won't log it. Track it as utang instead and tick off repayments as they come in.`,
      card: {
        kind: 'coach',
        data: {
          status: 'watch',
          title: 'Track this utang?',
          message: `${debtor} owes you${amountTxt}. I've prefilled it — just confirm.`,
          reasons: [
            {
              label: debtor,
              detail: stmt.amount ? peso(stmt.amount) : 'amount not given',
            },
          ],
        },
        actions: [trackAction],
      },
      followUps: ['Who owes me?', "What's my balance?"],
    };
  }

  // "how much do I owe" / "do I owe" / "who do I owe" read as the user's own
  // payables — clarify we track the other direction before answering.
  const payablePhrasing =
    /\b(?:i owe|do i owe|how much do i owe|i borrowed)\b/.test(seed);
  const note = payablePhrasing
    ? 'Quick note — I track money owed *to* you (utang), not what you owe. '
    : '';

  if (!debts.length) {
    return {
      text: `${note}You're not tracking any utang right now — money people owe you shows up here once you add it.`,
      actions: [OPEN_UTANG],
      followUps,
    };
  }

  const totalRemaining = debts.reduce((s, d) => s + d.remaining, 0);
  const count = debts.length;
  const ranked = [...debts]
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3);
  const whoClause =
    count === 1 ? ` by ${debts[0].debtor}` : ` across ${count} people`;

  return {
    text: `${note}You're owed ${peso(totalRemaining)}${whoClause}.`,
    card: {
      kind: 'coach',
      data: {
        status: 'watch',
        title: 'Owed to you',
        message: `${peso(totalRemaining)} still outstanding${
          count > 1 ? ` across ${count} people` : ''
        }.`,
        reasons: ranked.map((d) => ({
          label: d.debtor,
          detail:
            d.paid > 0
              ? `${peso(d.remaining)} left of ${peso(d.total)}`
              : peso(d.remaining),
        })),
      },
      actions: [OPEN_UTANG],
    },
    followUps,
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
      return answerBreakdown(ctx, slots);
    case 'topCategory':
      return answerTopCategory(ctx, slots);
    case 'compare':
      return answerCompare(ctx, slots);
    case 'cut':
      return answerCut(ctx);
    case 'count':
      return answerCount(ctx, slots);
    case 'savings':
      return answerSavings(ctx, slots);
    case 'coach':
      return answerCoach(ctx);
    case 'overspend':
      return answerOverspend(ctx, slots);
    case 'transactions':
      return answerTransactions(ctx, slots, seed);
    case 'categoryOf':
      return answerCategoryOf(ctx, slots);
    case 'salaryStatus':
      return answerSalaryStatus(ctx);
    case 'billStatus':
      return answerBillStatus(ctx, slots, seed);
    case 'summary':
      return answerSummary(ctx, slots, seed);
    case 'budgetStatus':
      return answerBudgetStatus(ctx, slots);
    case 'needsVsWants':
      return answerNeedsVsWants(ctx, slots);
    case 'dowPattern':
      return answerDowPattern(ctx, slots, seed);
    case 'incomeShare':
      return answerIncomeShare(ctx, slots);
    case 'trend':
      return answerTrend(ctx, slots);
    case 'typicalSpend':
      return answerTypicalSpend(ctx, slots, seed);
    case 'subscriptionCut':
      return answerSubscriptionCut(ctx);
    case 'emergencyFund':
      return answerEmergencyFund(ctx);
    case 'goalPlan':
      return answerGoalPlan(ctx, slots, seed);
    case 'bonusAdvice':
      return answerBonusAdvice(ctx);
    case 'improveSavings':
      return answerImproveSavings(ctx);
    case 'cutAmount':
      return answerCutAmount(ctx, slots);
    case 'ruleOfThumb':
      return answerRuleOfThumb(ctx);
    case 'impulseTips':
      return answerImpulseTips();
    case 'afford':
      return answerAfford(ctx, slots, seed);
    case 'debt':
      return answerDebt(ctx, slots, seed);
    case 'safeToSpend':
      return answerSafeToSpend(ctx);
    case 'reCategorize':
      return answerReCategorize(ctx, slots, seed);
    case 'splitBill':
      return answerSplitBill(slots);
    case 'runway':
      return answerRunway(ctx);
    case 'explainSpend':
      return answerExplainSpend(ctx);
    case 'monthPattern':
      return answerMonthPattern(ctx, slots, seed);
    case 'upcomingBills':
      return answerUpcomingBills(ctx, slots);
    case 'setBudget':
      return answerSetBudget(ctx, slots);
    case 'deleteTransaction':
      return answerDeleteTransaction(ctx, slots, seed);
    case 'transfer':
      return answerTransfer(ctx, slots, seed);
    case 'reminder':
      return answerReminder(slots, seed);
    default:
      return null;
  }
}
