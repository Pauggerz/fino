/**
 * Fino Brain — the offline reply engine for the chatbot.
 *
 * This is the local, dependency-free replacement for the Gemini round-trip
 * that used to power chat replies (see FINO_CHATBOT.md). It understands a
 * message purely on-device: no network, no API key, instant.
 *
 * Design: an ordered registry of intents. `routeMessage` normalizes the user
 * text, walks the registry, and returns the first intent whose `test` matches.
 * If nothing matches it returns FALLBACK. Order matters — put more specific
 * intents before broader ones.
 *
 * NOTE: transaction logging is NOT handled here. Typed transactions go through
 * the offline taxonomy parser (parseChatTransaction) on the ChatScreen send
 * path, which runs *before* this router. This engine only produces the
 * conversational reply text.
 *
 * ─── Data-aware intents ──────────────────────────────────────────────────────
 * The insight prompts (spending breakdown, compare to last month, where can I
 * cut, savings forecast) are answered from a live `BrainContext` threaded in by
 * the ChatScreen — balance, monthly totals, last-month spend, and the month's
 * top categories. These run after the pure intents and only when context is
 * supplied. Keep growth additive: add an entry, don't rewire the loop.
 */

export type BrainResponse = {
  text: string;
  /** Optional tappable suggested prompts rendered under the reply. */
  followUps?: string[];
};

/**
 * Live financial context the ChatScreen already holds. Passed into
 * `routeMessage` so the brain can answer insight questions with real numbers,
 * fully offline.
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

type Intent = {
  id: string;
  /** Receives the lowercased, trimmed message. Return true to claim it. */
  test: (normalized: string) => boolean;
  respond: () => BrainResponse;
};

// Greeting tokens, matched as whole words so "this is high" doesn't trigger on
// "hi". Covers English + Tagalog/Bisaya "kumusta" variants.
const GREETING_RE =
  /\b(hi|hello|hey|yo|hiya|sup|kumusta|kamusta|musta|kumusta ka)\b/;

const intents: Intent[] = [
  {
    id: 'greeting',
    test: (t) => GREETING_RE.test(t),
    respond: () => ({ text: 'Hello! How can I help you? 👋' }),
  },
];

const FALLBACK: BrainResponse = {
  text: "I'm still in development right now 🚧",
};

const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;

// ─── Data-aware intents ──────────────────────────────────────────────────────
// Each tester runs against the normalized message; first match wins. Ordered so
// the more specific phrasings ("compare", "cut", "save") win before the broad
// "spend/breakdown" catch-all.

function answerCompare(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut?', 'Give me a spending breakdown'];
  if (ctx.lastMonthSpent <= 0) {
    return {
      text: `I don't have last month's spending to compare against yet. So far this month you've spent ${peso(
        ctx.spent,
      )} — check back next month and I'll show you the trend.`,
      followUps,
    };
  }
  const diff = ctx.spent - ctx.lastMonthSpent;
  const pct = Math.round((Math.abs(diff) / ctx.lastMonthSpent) * 100);
  if (diff < 0) {
    return {
      text: `You're spending less this month — ${peso(ctx.spent)} vs ${peso(
        ctx.lastMonthSpent,
      )} last month, down ${pct}%. Nice work. 📉`,
      followUps,
    };
  }
  if (diff > 0) {
    return {
      text: `You're spending more this month — ${peso(ctx.spent)} vs ${peso(
        ctx.lastMonthSpent,
      )} last month, up ${pct}%. Want to see where it's going?`,
      followUps,
    };
  }
  return {
    text: `You're right on pace — ${peso(
      ctx.spent,
    )} this month, the same as last month.`,
    followUps,
  };
}

function answerCut(ctx: BrainContext): BrainResponse {
  const followUps = ['Compare to last month', 'Savings forecast'];
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
      top.amount,
    )}. Trimming it by just 15% would save you about ${peso(
      save15,
    )} a month. Want to keep an eye on it?`,
    followUps,
  };
}

function answerSavings(ctx: BrainContext): BrainResponse {
  const followUps = ['Where can I cut?', 'Give me a spending breakdown'];
  if (ctx.income <= 0) {
    return {
      text: "You haven't logged any income this month yet, so I can't forecast your savings. Add your income and I'll project where you'll land.",
      followUps,
    };
  }
  const saved = Math.max(0, ctx.income - ctx.spent);
  if (saved <= 0) {
    return {
      text: `Heads up — you've spent more than you've earned this month so far (${peso(
        ctx.spent,
      )} out vs ${peso(ctx.income)} in). Want to find where to cut back?`,
      followUps,
    };
  }
  const rate = Math.round((saved / ctx.income) * 100);
  const projectedSpend =
    ctx.dayOfMonth > 0
      ? (ctx.spent / ctx.dayOfMonth) * ctx.daysInMonth
      : ctx.spent;
  const projectedSaved = Math.max(0, ctx.income - projectedSpend);
  return {
    text: `You're saving ${peso(saved)} so far this month — about ${rate}% of your income. At this pace you'll finish the month around ${peso(
      projectedSaved,
    )} saved. 🎯`,
    followUps,
  };
}

function answerBreakdown(ctx: BrainContext): BrainResponse {
  const followUps = ['Compare to last month', 'Where can I cut?'];
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
  return {
    text: `You've spent ${peso(
      ctx.spent,
    )} this month. Here's where it went:\n${lines}`,
    followUps,
  };
}

function routeDataIntent(t: string, ctx: BrainContext): BrainResponse | null {
  if (/\blast month\b|compare|versus|\bvs\b/.test(t)) return answerCompare(ctx);
  if (/\bcut\b|cut back|reduce|trim|spend less|save more/.test(t)) {
    return answerCut(ctx);
  }
  if (/sav(e|ing)|forecast|on track|\bgoal\b/.test(t)) return answerSavings(ctx);
  if (/breakdown|where did|money go|how much|spent|spend|spending/.test(t)) {
    return answerBreakdown(ctx);
  }
  return null;
}

/**
 * Route a raw user message to an offline reply. Synchronous and side-effect
 * free — safe to call on the render path. Pass `ctx` to unlock the data-aware
 * insight intents.
 */
export function routeMessage(raw: string, ctx?: BrainContext): BrainResponse {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (!normalized) return FALLBACK;
  for (const intent of intents) {
    if (intent.test(normalized)) return intent.respond();
  }
  if (ctx) {
    const dataReply = routeDataIntent(normalized, ctx);
    if (dataReply) return dataReply;
  }
  return FALLBACK;
}
