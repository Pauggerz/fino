/**
 * Short-term conversational memory — multi-turn slot/intent carry-over.
 *
 * The brain is pure & synchronous and holds no state of its own (see
 * `brain.ts`). To let a follow-up lean on what came before — "how much on
 * food?" → "what about last month?" → "and transport?" — ChatScreen carries a
 * bounded window of recently-resolved turns in `BrainContext.memory` and stores
 * the updated window the brain returns on `BrainResponse.memory`. This module
 * is the pure glue: it decides (a) whether a new message is a *continuation*
 * that should inherit gaps from the previous turn, (b) which slots/intent to
 * fill, and (c) how to fold the resolved turn back into the window.
 *
 * No DB, no async, no module state — every function here is pure and covered by
 * `npm run test:memory`.
 */

import type { Slots } from './slots';
import type { IntentId } from './intents';
import type { ConversationMemory, ConversationTurn } from './types';

/** Newest-last window cap. ChatScreen trims to this; kept here so the merge and
 *  the store agree on the bound. Small on purpose — only the last few turns are
 *  ever relevant to a follow-up, and an unbounded log would grow every send. */
export const CONVERSATION_MEMORY_MAX = 6;

/** A turn is only worth inheriting from for a short while — a continuation is an
 *  immediate reply, not something typed ten minutes later. Older turns stay in
 *  the window for display/debugging but never feed gap-filling. */
const CONTINUATION_TTL_MS = 5 * 60 * 1000;

/**
 * A message reads as a *continuation* when it is phrased as a follow-up to the
 * previous turn rather than a fresh, self-contained question. These are the
 * cues that say "apply what we were just talking about to this new detail":
 *
 *   "what about last month?"   (what about / how about / and …?)
 *   "and transport?"           (leading "and"/"what about" + a bare slot)
 *   "last month?"              (a bare time/category fragment, nothing else)
 *
 * Deliberately narrow: a message that already carries its own interrogative and
 * subject ("how much did I spend on food?") is self-contained and must NOT be
 * treated as a continuation, or it would wrongly inherit a stale category.
 */
const CONTINUATION_CUE_RE =
  /^(?:and|what about|how about|whatabout|howabout|also|then|ok(?:ay)?(?: )?(?:and)?)\b|^&/i;

/**
 * True when `raw` (already normalized) is short and lacks a verb/interrogative
 * of its own — a bare fragment like "last month" or "transport" that only makes
 * sense against the previous turn.
 */
function isBareFragment(raw: string): boolean {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;
  // Anything with its own question word / verb is self-contained.
  return !/\b(how|what|whats|where|which|why|when|who|do|did|does|is|are|was|were|can|could|should|would|will|have|has|spend|spent|show|list|give)\b/i.test(
    raw
  );
}

/** True when the message wants to build on the prior turn. */
export function isContinuation(normalizedRaw: string): boolean {
  const t = normalizedRaw.trim();
  if (!t) return false;
  if (CONTINUATION_CUE_RE.test(t)) return true;
  return isBareFragment(t);
}

/** The most recent turn still inside the continuation window, or null. */
function freshPriorTurn(
  memory: ConversationMemory | undefined,
  nowMs: number
): ConversationTurn | null {
  if (!memory || memory.turns.length === 0) return null;
  const last = memory.turns[memory.turns.length - 1];
  if (!last.at) return null;
  const ageMs = nowMs - Date.parse(last.at);
  if (!Number.isFinite(ageMs) || ageMs > CONTINUATION_TTL_MS) return null;
  return last;
}

export type MergeResult = {
  /** Intent to actually answer with (carried forward when the message had none
   *  of its own but is a continuation). */
  intent: IntentId | null;
  /** Slots after inheriting any missing time/category/merchant from the prior
   *  turn. A copy — never mutates the input. */
  slots: Slots;
  /** True when anything was inherited (for tests / telemetry). */
  inherited: boolean;
};

export type MergeInput = {
  /** Intent the follow-up resolved on its own (null when it resolved none). */
  intent: IntentId | null;
  /** Slots the follow-up extracted on its own. */
  slots: Slots;
  /** True when the follow-up's own intent came from a CONFIDENT rule win
   *  (source 'rules', margin ≥ 1). A confident self-intent is kept as-is; a
   *  weak/classifier guess defers to the prior intent when the message is just
   *  refining a slot. Lets "what about my balance?" switch intent while "what
   *  about last month?" keeps the prior question and only swaps the window. */
  selfIntentConfident: boolean;
  /** True when the follow-up's intent actually consumes a time window (spend /
   *  breakdown / topCategory / summary / transactions / needsVsWants /
   *  dowPattern). Such an intent inherits a "sticky" session window even when it
   *  isn't phrased as a continuation — so "this week" then a fresh "give me a
   *  breakdown" stays on this week instead of snapping back to the month. */
  intentIsTimeScoped: boolean;
};

/**
 * Fill gaps in a freshly-classified follow-up from the previous turn.
 *
 * There are two distinct carry-over rules, deliberately scoped differently:
 *
 *  • TIME WINDOW — "sticky" within a session. Inherited when the new turn has a
 *    time-scoped intent but named no window of its own, EITHER as a continuation
 *    ("what about last month?") OR as a fresh self-contained command after a
 *    windowed turn ("…this week" → "give me a breakdown"). This is what keeps a
 *    breakdown/top-category on the window you just set instead of snapping back
 *    to "this month". A clearly-temporal-but-unresolved phrase ("lately") is
 *    left alone so the brain still clarifies.
 *
 *  • CATEGORY / MERCHANT / INTENT — continuation-only (a leading "and …" / "what
 *    about …" / a bare fragment). These are narrower in scope on purpose: a
 *    fresh, self-contained command should NOT silently inherit the previous
 *    category or question, only the ambient window. Intent is also carried when
 *    a continuation only *weakly* guessed one while refining an inherited slot.
 */
export function mergeWithMemory(
  rawNormalized: string,
  input: MergeInput,
  memory: ConversationMemory | undefined,
  nowMs: number
): MergeResult {
  const { intent, slots, selfIntentConfident, intentIsTimeScoped } = input;
  const prior = freshPriorTurn(memory, nowMs);
  if (!prior) return { intent, slots, inherited: false };

  const continuation = isContinuation(rawNormalized);
  const next: Slots = { ...slots };
  let inheritedSlot = false;

  // Sticky time window: inherit when the new turn could use one but didn't name
  // one — for a continuation OR a fresh time-scoped intent. (Not gated on
  // `continuation`, unlike the category/merchant/intent rules below.)
  const canInheritWindow =
    !next.timeRange &&
    !next.timeRangeUnresolved &&
    !!prior.timeRange &&
    (continuation || intentIsTimeScoped);
  if (canInheritWindow) {
    next.timeRange = prior.timeRange;
    inheritedSlot = true;
  }

  // Category + merchant carry over only for an explicit continuation.
  if (continuation && !next.category && prior.category) {
    next.category = prior.category;
    inheritedSlot = true;
  }
  if (continuation && !next.merchant && prior.merchant) {
    next.merchant = prior.merchant;
    inheritedSlot = true;
  }

  // Intent carry-over is continuation-only: a fresh command keeps its own
  // intent (and just borrows the ambient window above).
  let nextIntent = intent;
  let inheritedIntent = false;
  const priorIntent = prior.intent as IntentId | null;
  if (continuation && priorIntent) {
    if (!nextIntent) {
      nextIntent = priorIntent;
      inheritedIntent = true;
    } else if (
      !selfIntentConfident &&
      inheritedSlot &&
      nextIntent !== priorIntent
    ) {
      // Weak guess on a slot-refinement → the user is refining the previous
      // question, not asking a new one.
      nextIntent = priorIntent;
      inheritedIntent = true;
    }
  }

  return {
    intent: nextIntent,
    slots: next,
    inherited: inheritedSlot || inheritedIntent,
  };
}

/**
 * Fold a just-resolved turn into the window: append it, drop anything past the
 * cap (oldest first). Returns a NEW memory object (never mutates the input), so
 * ChatScreen can store it with a plain setState. A turn that carried nothing
 * worth remembering (no intent, no category/time/merchant) is skipped — the
 * window then passes through unchanged.
 */
export function rememberTurn(
  memory: ConversationMemory | undefined,
  turn: ConversationTurn
): ConversationMemory {
  const prev = memory?.turns ?? [];
  const carriesSignal =
    turn.intent !== null ||
    turn.category !== undefined ||
    turn.timeRange !== undefined ||
    turn.merchant !== undefined;
  if (!carriesSignal) return { turns: prev };
  const turns = [...prev, turn].slice(-CONVERSATION_MEMORY_MAX);
  return { turns };
}

/** Build the `ConversationTurn` to remember from a resolved message. Pulls the
 *  small, inheritable facts off the slots; `at` is the resolution timestamp. */
export function turnFromResolved(
  intent: IntentId | null,
  slots: Slots,
  atIso: string
): ConversationTurn {
  return {
    intent,
    category: slots.category,
    timeRange: slots.timeRange,
    amounts: slots.amounts.length ? [...slots.amounts] : undefined,
    merchant: slots.merchant,
    at: atIso,
  };
}
