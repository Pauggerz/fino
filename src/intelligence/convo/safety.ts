/**
 * Abuse guard — a deterministic pre-classification veto for clearly offensive
 * input (FINO_CHATBOT §3). The Naive-Bayes `unknown` class already rejects most
 * out-of-scope chatter, but profanity is high-variance and ML trained on a
 * small corpus can't be *guaranteed* to reject every variant — and the one
 * thing we never want is the bot answering a slur with the user's salary.
 *
 * So this is a high-precision lexical net: clear profanity / sexual abuse →
 * route to the gentle fallback instead of a finance answer, regardless of what
 * the classifier thinks. Word-boundaried so it never trips on innocent
 * substrings ("class", "assess", "cockpit"). Pure & synchronous — covered by
 * the `scripts/test-route.ts` harness.
 */

import { normalize } from '../core/normalize';

// Common EN + Tagalog profanity / sexual-abuse stems. Kept intentionally small
// and word-boundaried; this is a safety net, not exhaustive moderation.
const ABUSE_RE = new RegExp(
  [
    String.raw`\bf+u+c+k`, // fuck, fuuuck, fucking, motherfucker
    String.raw`\b(bull)?shit\b`,
    String.raw`\b(dick|cock|pussy|cum|boobs?|tits?)\b`,
    String.raw`\bsuck (my|me|it|this)\b`,
    String.raw`\byou suck\b`,
    String.raw`\bblow me\b`,
    String.raw`\b(bitch|bastard|asshole|a\$\$hole)\b`,
    String.raw`\b(slut|whore)\b`,
    String.raw`\bkiss my ass\b`,
    String.raw`\bpiss off\b`,
    // Tagalog (no 'leche'/'hoe' — they collide with "leche flan", "garden hoe")
    String.raw`\b(tang+ina|putang ?ina|puta|gago|bobo|tanga|ulol|tarantado|pakyu)\b`,
  ].join('|'),
  'i'
);

/**
 * True when a message is clearly abusive/obscene and should be declined rather
 * than answered. ChatScreen's brain consults this BEFORE classification.
 */
export function isAbusive(raw: string): boolean {
  const t = normalize(raw);
  if (!t) return false;
  return ABUSE_RE.test(t);
}
