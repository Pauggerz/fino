/**
 * Log-vs-ask gate (FINO_CHATBOT §3, the "one message = log OR answer" law).
 *
 * The chat logger treats any message with a peso amount as a transaction to
 * log. That collides with amount-bearing QUESTIONS ("where can I cut ₱2,000?",
 * "transactions over ₱5,000 this year", "the ₱1,500 charge"), which would
 * otherwise be silently logged instead of answered.
 *
 * `looksLikeQuestion` is a pure, high-precision veto: it returns true only when
 * the message is clearly phrased as a query — interrogative, comparison/range,
 * advice-target, or specific-charge lookup framing. It is deliberately tuned
 * toward "log" (statements like "lunch 120", "spent 50 on grab", "bonus 5000"
 * never match), so ChatScreen can route the question-shaped messages to the
 * brain without regressing the logging path. No DB, no async — testable in the
 * `tsx` harness (scripts/test-route.ts).
 */

import { normalize } from '../core/normalize';

const QUERY_CUE_RE = new RegExp(
  [
    // Interrogatives.
    String.raw`\b(how|what|whats|where|which|why|when|who|whose)\b`,
    // Question auxiliary + subject pronoun: "did i", "is my", "can i", "should i".
    String.raw`\b(do|did|does|am|is|are|was|were|can|could|should|would|will|have|has)\s+(i|we|you|my|me)\b`,
    // Comparison / range — REQUIRE a following number so plain logs never trip.
    String.raw`\b(over|above|under|below|more than|less than|fewer than|at least|at most|greater than|cheaper than|up to|between)\s+₱?\s?\d`,
    // Advice / target framing — each carries "for/back/me" so logs don't match.
    String.raw`\b(cut back|where can i|save (up )?for|saving for|free up|help me|how do i|how can i)\b`,
    // Specific-charge lookup: "the/that ₱1,500 charge|transaction|payment|…".
    String.raw`\b(the|that)\s+₱?\d[\d,]*\s*(charge|transaction|payment|expense|purchase|bill)\b`,
  ].join('|'),
  'i'
);

/**
 * True when an amount-bearing message reads as a question/query rather than a
 * transaction to log. ChatScreen consults this BEFORE `parseChatTransaction`,
 * so a query is answered by the brain instead of creating a bogus transaction.
 */
export function looksLikeQuestion(raw: string): boolean {
  const t = normalize(raw);
  if (!t) return false;
  return QUERY_CUE_RE.test(t);
}
