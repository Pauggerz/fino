import categoryMappings from '../constants/categoryMappings';
import { transitions } from '../constants/transitions';

export type Category =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'other';

/** Expose the mapping dict for external use (e.g. tests). */
export const aiMappings = categoryMappings;

export interface AIAnalysisResult {
  suggestedCategory: Category | null;
  confidence: 'high' | 'low';
  matchedKeyword: string | null;
  /** Where the category signal came from — stored with every saved transaction. */
  signal_source: 'ai_description' | 'none';
}

/**
 * Pure text → category analysis (no side-effects).
 * Priority: multi-word phrases first, then individual words.
 */
export function analyzeTransactionText(text: string): AIAnalysisResult {
  if (!text || text.trim() === '') {
    return {
      suggestedCategory: null,
      confidence: 'low',
      matchedKeyword: null,
      signal_source: 'none',
    };
  }

  const normalizedText = text.toLowerCase().trim();
  const words = normalizedText.replace(/[^\w\s-]/g, '').split(/\s+/);

  // 1. Multi-word phrase match (e.g. "milk tea", "piso wifi")
  const multiWordMatch = Object.keys(aiMappings).find(
    (key) => key.includes(' ') && normalizedText.includes(key)
  );
  if (multiWordMatch) {
    return {
      suggestedCategory: aiMappings[multiWordMatch],
      confidence: 'high',
      matchedKeyword: multiWordMatch,
      signal_source: 'ai_description',
    };
  }

  // 2. Single-word match
  const wordMatch = words.find((word) => aiMappings[word]);
  if (wordMatch) {
    return {
      suggestedCategory: aiMappings[wordMatch],
      confidence: 'high',
      matchedKeyword: wordMatch,
      signal_source: 'ai_description',
    };
  }

  return {
    suggestedCategory: null,
    confidence: 'low',
    matchedKeyword: null,
    signal_source: 'none',
  };
}

export type AIAnalysisCallback = (result: AIAnalysisResult) => void;

/**
 * Returns a debounced analyzer that matches the prototype's
 * `clearTimeout(aiMapTimer)` pattern (300 ms debounce).
 *
 * Usage:
 *   const analyzer = useRef(createDebouncedAnalyzer()).current;
 *   analyzer.analyze(text, (result) => { ... });
 *   // call analyzer.cancel() on unmount
 */
export function createDebouncedAnalyzer(): {
  analyze: (text: string, cb: AIAnalysisCallback) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    analyze(text: string, cb: AIAnalysisCallback) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cb(analyzeTransactionText(text));
        timer = null;
      }, transitions.AI_MAPPING_DEBOUNCE); // 300 ms
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
