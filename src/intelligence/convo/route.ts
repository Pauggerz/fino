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
    // Evaluative affordability framing without a pronoun ("is ₱5,000 too much
    // for food?", "is that worth it?"). The cue word is the discriminator — a
    // plain log never says "too much / worth it / a rip-off".
    String.raw`\b(too (much|expensive|pricey|steep)|worth it|a (rip ?off|good deal|fair price)|reasonable (price|amount))\b`,
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

// Imperative/statement phrasings that aren't questions but still must NOT be
// logged: an amount-bearing re-categorize ("recategorize the ₱1,500 charge as
// Coffee"), split ("split my ₱100 bill"), debt statement ("Paul owed me 5k"),
// or goal statement ("goal this month to buy iPhone 17") would otherwise be
// silently turned into a bogus transaction. Tuned to "command" — plain logs
// ("lunch 120", "save 500 to gcash") never match (no re-tag verb, no
// "split … bill/with", no owe/borrow/lent, no "goal").
const COMMAND_CUE_RE = new RegExp(
  [
    // Re-tag verbs are near-unambiguous on their own.
    String.raw`\b(re-?categori[sz]e|reclassify|re-?tag)\b`,
    // move/transfer/change/switch/mark/put/file <subject> as|to|into|under <dest>.
    String.raw`\b(move|transfer|change|switch|mark|put|file)\b.+\b(as|to|into|under)\b`,
    // Splitting a shared bill (needs a bill/people cue so item logs don't match).
    String.raw`\bsplit\b[^.]{0,16}\b(bill|tab|check|receipt|cost|expense|dinner|lunch|meal|payment|with|between|among)\b`,
    String.raw`\bgo dutch\b`,
    // Budget commands: "set a budget of 5000 for food", "budget 3000 for
    // transport", "cap my food at 4000" — a target/limit, never a purchase log.
    String.raw`\b(set|create|make|add|update|change|give me)\b[^.]{0,16}\bbudgets?\b`,
    String.raw`\bbudgets?\b\s*(?:of\s*)?(?:₱|php)?\s?\d`,
    String.raw`\bcap\b[^.]{0,20}\bat\s*(?:₱|php)?\s?\d`,
    // Reminders: "remind me to pay my electric bill 2000".
    String.raw`\bremind me\b`,
    String.raw`\bset (?:a |an )?reminder\b`,
    // Purchase intent, not a purchase: "i want to buy a phone for 25000".
    String.raw`\b(?:want|wanna|plan|planning|would like|d like)\s+to\s+(?:buy|get|purchase)\b`,
    // Deleting an existing row: "delete the ₱500 charge", "remove my last expense".
    String.raw`\b(delete|remove|erase|scrap|undo)\b[^.]{0,24}\b(transactions?|charges?|expenses?|purchases?|payments?|entry|entries|one)\b`,
    // Debt/receivable statements ("Paul owed me 5k", "Paul borrowed 5k",
    // "lent Paul 500", "I owe Marie 200", "Paul paid me back") — these belong
    // in the Utang Tracker, never the expense log; the brain proposes tracking.
    String.raw`\b(owes?|owed)\s+me\b`,
    String.raw`\bi\s+owe\b`,
    String.raw`\b(borrowed|lent|loaned)\b`,
    String.raw`\butang\b`,
    String.raw`\bpaid me back\b`,
    // Goal statements ("goal this month to buy iPhone 17", "my goal is to
    // save 50k") — a savings goal to stage, never a purchase to log.
    String.raw`\bgoals?\b[^.]{0,40}\b(buy|get|purchase|save|saving|afford)\b`,
    String.raw`\b(my|new)\s+goal\b`,
  ].join('|'),
  'i'
);

/**
 * True when a message reads as a mutation COMMAND (re-categorize / split) rather
 * than a transaction to log. ChatScreen consults this alongside
 * `looksLikeQuestion` so an amount-bearing command reaches the brain (which
 * proposes a confirm) instead of creating a bogus transaction.
 */
export function looksLikeCommand(raw: string): boolean {
  const t = normalize(raw);
  if (!t) return false;
  return COMMAND_CUE_RE.test(t);
}
