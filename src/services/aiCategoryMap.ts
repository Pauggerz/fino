export type Category =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'other';

// Exact mapping from the HTML prototype script
export const aiMappings: Record<string, Category> = {
  // Food
  lunch: 'food',
  tanghalian: 'food',
  meryenda: 'food',
  agahan: 'food',
  hapunan: 'food',
  breakfast: 'food',
  dinner: 'food',
  snack: 'food',
  kain: 'food',
  pagkain: 'food',
  hamburger: 'food',
  burger: 'food',
  pizza: 'food',
  rice: 'food',
  palengke: 'food',
  grocery: 'food',
  groceries: 'food',
  coffee: 'food',
  'milk tea': 'food',

  // Transport
  grab: 'transport',
  angkas: 'transport',
  tricycle: 'transport',
  jeep: 'transport',
  jeepney: 'transport',
  bus: 'transport',
  taxi: 'transport',
  lrt: 'transport',
  mrt: 'transport',
  pasahe: 'transport',
  fare: 'transport',
  sakay: 'transport',

  // Bills
  load: 'bills',
  'e-load': 'bills',
  paload: 'bills',
  kuryente: 'bills',
  meralco: 'bills',
  tubig: 'bills',
  water: 'bills',
  internet: 'bills',
  wifi: 'bills',
  rent: 'bills',

  // Health
  gamot: 'health',
  medisina: 'health',
  medicine: 'health',
  doctor: 'health',
  hospital: 'health',
  botika: 'health',
  pharmacy: 'health',

  // Shopping
  clothes: 'shopping',
  damit: 'shopping',
  shoes: 'shopping',
  sapatos: 'shopping',
  lazada: 'shopping',
  shopee: 'shopping',
  mall: 'shopping',
};

export interface AIAnalysisResult {
  suggestedCategory: Category | null;
  confidence: 'high' | 'low';
  matchedKeyword: string | null;
}

/**
 * Analyzes a text string to find the most likely transaction category
 * using the local AI mapping dictionary.
 */
export function analyzeTransactionText(text: string): AIAnalysisResult {
  if (!text || text.trim() === '') {
    return { suggestedCategory: null, confidence: 'low', matchedKeyword: null };
  }

  const normalizedText = text.toLowerCase().trim();
  const words = normalizedText.replace(/[^\w\s-]/g, '').split(/\s+/);

  // 1. Multi-word matches
  const multiWordMatch = Object.keys(aiMappings).find(
    (key) => key.includes(' ') && normalizedText.includes(key)
  );

  if (multiWordMatch) {
    return {
      suggestedCategory: aiMappings[multiWordMatch],
      confidence: 'high',
      matchedKeyword: multiWordMatch,
    };
  }

  // 2. Individual word matches
  const wordMatch = words.find((word) => aiMappings[word]);

  if (wordMatch) {
    return {
      suggestedCategory: aiMappings[wordMatch],
      confidence: 'high',
      matchedKeyword: wordMatch,
    };
  }

  return { suggestedCategory: null, confidence: 'low', matchedKeyword: null };
}