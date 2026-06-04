/**
 * Feature extraction for the Convo classifier — word + character n-grams.
 *
 * Shared by the offline trainer (`scripts/train-brain.ts`) and the on-device
 * inference (`naiveBayes.ts`) so train and serve see identical features
 * (FINO_INTELLIGENCE_V2.md §4.1). Pure, synchronous, no model weights — the
 * learned parameters live in `model.json`.
 *
 * Why char n-grams: they absorb Taglish spelling drift without an exhaustive
 * synonym list — "kumusta / kamusta / musta" share the grams "kus", "ust",
 * "sta"; "gcash / g-cash" share "cas", "ash". The `<`/`>` word sentinels make
 * prefixes/suffixes their own features, which doubles as the brief's
 * Tagalog/Bisaya affix signal ("nag-", "-an", "naka-").
 *
 * Feature namespaces keep a word and an identical char-gram string distinct:
 *   `w:` word unigram   ·   `c:` character n-gram
 */

import { normalize, tokenize } from '../../core/normalize';

/** Character n-gram sizes. 3–4 is the sweet spot for short PH-finance text. */
const CHAR_NGRAMS = [3, 4];

/**
 * Turn a raw message into a sparse feature-count map. Counts (term frequency)
 * are what Multinomial NB consumes; IDF weighting is applied later from the
 * trained model so the transform is identical at train and inference time.
 */
export function featurize(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (term: string): void => {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  };

  const words = tokenize(normalize(text));
  for (const w of words) {
    bump(`w:${w}`);
    const padded = `<${w}>`;
    for (const n of CHAR_NGRAMS) {
      for (let i = 0; i + n <= padded.length; i += 1) {
        bump(`c:${padded.slice(i, i + n)}`);
      }
    }
  }
  return counts;
}
