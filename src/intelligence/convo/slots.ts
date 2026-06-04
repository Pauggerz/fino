/**
 * Slot extraction — rule chunking, not CRF (FINO_INTELLIGENCE_V2.md §4.2).
 *
 * We deliberately reuse the categorization engine as the entity recognizer:
 * the same taxonomy that tags "kape → Coffee" when *logging* detects "kape" as
 * a category slot when *asking*. Time ranges come from the `core/time` grammar,
 * amounts from the shared extractor. Everything is dictionary + rule based, so
 * it ships to Hermes with no model weights.
 *
 * Slots are read off the original normalized message (not the canonicalized
 * one), so a category/time/amount the user mentioned is never lost to an
 * intent reduction.
 */

import { analyzeTransactionText } from '../categorize/categorize';
import type { MasterCategory } from '../taxonomy/taxonomy';
import { expandNumberWords } from '../core/normalize';
import { extractAmounts } from '../core/amounts';
import { parseTimeRange, type TimeRange } from '../core/time';

const MASTER_LABELS: Record<MasterCategory, string> = {
  food: 'Food',
  transport: 'Transport',
  bills: 'Bills',
  health: 'Health',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  other: 'Other',
};

export type CategorySlot = {
  /** Master taxonomy bucket the keyword resolved to. */
  master: MasterCategory;
  /** The surface keyword that matched ("coffee", "grab", "meralco"). */
  keyword: string;
  /** Best display label — the user's own category name when known, else the
   *  master label. */
  label: string;
};

export type Slots = {
  /** Parsed time window, or undefined when no temporal phrase was present. */
  timeRange?: TimeRange;
  /** Category the question is scoped to ("how much on food"), if any. */
  category?: CategorySlot;
  /** Any peso/number amounts in the message ("more than 1000"). */
  amounts: number[];
};

export type SlotOptions = {
  /** Injectable clock for deterministic tests. */
  now?: Date;
  /** The user's active category names, so a matched keyword bubbles up to the
   *  user's own category label (e.g. "Coffee" instead of master "Food"). */
  categoryNames?: string[];
};

/**
 * Extract structured slots from a normalized question. Pure and synchronous.
 *
 * The category slot only fires on a HIGH-confidence taxonomy match — in a
 * question we want solid signals ("on coffee", "for grab") and would rather
 * miss a fuzzy guess than scope an answer to the wrong category.
 */
export function extractSlots(
  normalized: string,
  opts: SlotOptions = {}
): Slots {
  const slots: Slots = { amounts: [] };

  const timeRange = parseTimeRange(normalized, opts.now);
  if (timeRange) slots.timeRange = timeRange;

  slots.amounts = extractAmounts(expandNumberWords(normalized));

  const analysis = analyzeTransactionText(normalized, opts.categoryNames);
  if (
    analysis.matchedKeyword &&
    analysis.suggestedCategory &&
    analysis.confidence === 'high' &&
    analysis.matchedKeyword.length >= 3
  ) {
    slots.category = {
      master: analysis.suggestedCategory,
      keyword: analysis.matchedKeyword,
      label:
        analysis.resolvedCategory ?? MASTER_LABELS[analysis.suggestedCategory],
    };
  }

  return slots;
}
