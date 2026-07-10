/**
 * Online-assist contract — the client half of the LLM router tier
 * (INTELLIGENCE_UPGRADE.md, Phase C).
 *
 * The LLM never answers and never sees the user's numbers. Its whole job is
 * ROUTING: given a message the offline brain couldn't confidently place, it
 * picks one of the intents below and rewrites the message as a short canonical
 * query the offline pipeline parses well ("hw mch fud dis mnth??" →
 * {intent:"spend", query:"how much did I spend on food this month"}). The
 * device then re-runs `routeMessage` on the rewrite — all figures, cards, and
 * confirms stay on-device and typed.
 *
 * This module is PURE (tsx-harness safe): the id whitelist, the response
 * validator, and the decision type. The prompt + catalog text live in the
 * `brain-assist` Supabase Edge Function (server-controlled; redeploy it when
 * intents are added — see supabase/functions/brain-assist/index.ts).
 */

import type { IntentId } from './intents';
import type { BrainResponseMeta } from './types';
import { MEDIUM_CONFIDENCE } from './brain';

/** Non-intent decisions the assist may return. */
export type AssistSpecial = 'log' | 'none';

export type AssistDecision = {
  /** A known intent id, or 'log' (a purchase statement → confirm chip, never a
   *  silent write) or 'none' (the LLM couldn't place it either). */
  intent: IntentId | AssistSpecial;
  /** The canonical rewrite to feed back through the offline pipeline. Empty
   *  when intent is 'none'. */
  query: string;
};

// Keep in sync with `IntentId` (intents.ts) — a Set so validation is O(1).
// 'greeting'/'thanks' are deliberately absent: chit-chat never reaches the
// assist tier (it either matches offline or isn't worth a network call).
const ASSIST_INTENTS = new Set<string>([
  'help',
  'balance',
  'income',
  'spend',
  'breakdown',
  'topCategory',
  'compare',
  'cut',
  'savings',
  'count',
  'coach',
  'overspend',
  'transactions',
  'categoryOf',
  'salaryStatus',
  'billStatus',
  'summary',
  'budgetStatus',
  'needsVsWants',
  'dowPattern',
  'incomeShare',
  'trend',
  'typicalSpend',
  'subscriptionCut',
  'emergencyFund',
  'goalPlan',
  'bonusAdvice',
  'improveSavings',
  'cutAmount',
  'ruleOfThumb',
  'impulseTips',
  'afford',
  'debt',
  'safeToSpend',
  'reCategorize',
  'splitBill',
  'runway',
  'explainSpend',
  'monthPattern',
  'upcomingBills',
  'setBudget',
  'deleteTransaction',
  'transfer',
  'reminder',
]);

const MAX_QUERY_LEN = 140;

/**
 * Validate an assist payload into a safe {@link AssistDecision}, or null.
 * Defensive on purpose — the payload crossed the network and came out of a
 * language model: unknown intents, multi-line/overlong rewrites, or anything
 * that doesn't look like plain chat text is rejected wholesale (the caller
 * just keeps the offline clarify).
 */
export function validateAssistDecision(raw: unknown): AssistDecision | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const intent = typeof obj.intent === 'string' ? obj.intent.trim() : '';
  const query = typeof obj.query === 'string' ? obj.query.trim() : '';

  if (intent === 'none') return { intent: 'none', query: '' };

  const known = intent === 'log' || ASSIST_INTENTS.has(intent);
  if (!known) return null;
  if (!query || query.length > MAX_QUERY_LEN) return null;
  if (/[\n\r]/.test(query)) return null;
  // Plain chat text only — no URLs, no markup, no code.
  if (/https?:|www\.|[<>{}[\]`]/i.test(query)) return null;

  return { intent: intent as IntentId | AssistSpecial, query };
}

/**
 * Should the host adopt the offline brain's re-run of an assist rewrite as the
 * turn's answer? (REVIEW_2026-07-08 P1.2 — extracted from ChatScreen so the
 * adoption logic is unit-testable; `npm run test:assist` gates it.)
 *
 * Adopt only when the offline brain confidently understood the rewrite — a
 * shaky reroute would just launder the original guess through prettier words:
 *   · a resolved intent (not a fallback),
 *   · not `logClarify` (a pseudo-intent, not an answer: adopting it would
 *     reply "couldn't find the amount" to a question, and it must never seed
 *     the miss buffer as a trainable label — P0.3),
 *   · not itself assist-eligible (the rewrite can't need another assist),
 *   · at or above MEDIUM_CONFIDENCE, so this stays in lockstep with a future
 *     recalibration (B4) instead of a hardcoded threshold.
 */
export function shouldAdoptAssistReroute(
  meta: BrainResponseMeta | undefined
): meta is BrainResponseMeta {
  return Boolean(
    meta &&
    meta.intent !== null &&
    meta.intent !== 'logClarify' &&
    !meta.assistEligible &&
    meta.confidence >= MEDIUM_CONFIDENCE
  );
}
