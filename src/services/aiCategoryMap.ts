export type Category = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'other';

// Exact mapping from the HTML prototype script
export const aiMappings: Record<string, Category> = {
  // Food
  'lunch': 'food', 'tanghalian': 'food', 'meryenda': 'food', 'agahan': 'food', 'hapunan': 'food',
  'breakfast': 'food', 'dinner': 'food', 'snack': 'food', 'kain': 'food', 'pagkain': 'food',
  'hamburger': 'food', 'burger': 'food', 'pizza': 'food', 'rice': 'food', 'palengke': 'food',
  'grocery': 'food', 'groceries': 'food', 'coffee': 'food', 'milk tea': 'food',
  
  // Transport
  'grab': 'transport', 'angkas': 'transport', 'tricycle': 'transport', 'jeep': 'transport',
  'jeepney': 'transport', 'bus': 'transport', 'taxi': 'transport', 'lrt': 'transport',
  'mrt': 'transport', 'pasahe': 'transport', 'fare': 'transport', 'sakay': 'transport',
  
  // Bills
  'load': 'bills', 'e-load': 'bills', 'paload': 'bills', 'kuryente': 'bills', 'meralco': 'bills',
  'tubig': 'bills', 'water': 'bills', 'internet': 'bills', 'wifi': 'bills', 'rent': 'bills',
  
  // Health
  'gamot': 'health', 'medisina': 'health', 'medicine': 'health', 'doctor': 'health',
  'hospital': 'health', 'botika': 'health', 'pharmacy': 'health',
  
  // Shopping
  'clothes': 'shopping', 'damit': 'shopping', 'shoes': 'shopping', 'sapatos': 'shopping',
  'lazada': 'shopping', 'shopee': 'shopping', 'mall': 'shopping',
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

  // Normalize input: lowercase, remove special characters, split into words
  const normalizedText = text.toLowerCase().trim();
  const words = normalizedText.replace(/[^\w\s-]/g, '').split(/\s+/);

  // 1. Check for exact multi-word matches first (e.g., "milk tea")
  for (const key in aiMappings) {
    if (key.includes(' ') && normalizedText.includes(key)) {
      return {
        suggestedCategory: aiMappings[key],
        confidence: 'high',
        matchedKeyword: key,
      };
    }
  }

  // 2. Check individual words against the dictionary
  for (const word of words) {
    if (aiMappings[word]) {
      return {
        suggestedCategory: aiMappings[word],
        confidence: 'high',
        matchedKeyword: word,
      };
    }
  }

  // 3. Fallback: No match found
  return {
    suggestedCategory: null,
    confidence: 'low',
    matchedKeyword: null,
  };
}