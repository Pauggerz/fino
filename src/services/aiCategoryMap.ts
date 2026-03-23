// Sourced to match the categories defined in your theme.ts
type CategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health';

export interface AIMappingResult {
  categoryId: CategoryId;
  confidence: number;
  suggestedMerchantName: string;
}

// Simulated local merchant database for the AI to "recognize"
// Weighted for the Philippine/Central Visayas context to make testing realistic
const MERCHANT_KNOWLEDGE_BASE: Record<CategoryId, string[]> = {
  food: ['jollibee', 'mcdonald', 'foodpanda', 'grabfood', 'dimsum break', 'bos coffee', 'starbucks', 'chowking'],
  transport: ['grab', 'angkas', 'joyride', 'maxim', 'shell', 'petron', 'caltex', 'cebu pacific'],
  shopping: ['sm', 'ayala', 'shopee', 'lazada', 'metro', 'watsons', 'sari-sari'],
  bills: ['veco', 'mcwd', 'globe', 'smart', 'pldt', 'netflix', 'spotify'],
  health: ['rose pharmacy', 'mercury drug', 'chong hua', 'cebudoc', 'watsons'],
};

/**
 * Simulates an AI categorization endpoint.
 * Takes raw, messy text (e.g., from an OCR scan or manual typo) and returns
 * a clean merchant name, a predicted category, and a confidence score.
 */
export const simulateAIMap = async (rawInput: string): Promise<AIMappingResult> => {
  // Simulate network latency/LLM processing time (800ms)
  await new Promise((resolve) => setTimeout(resolve, 800));

  const normalizedInput = rawInput.toLowerCase().trim();
  
  // Default fallbacks if the AI can't confidently map the input
  let matchedCategory: CategoryId = 'shopping'; 
  let confidence = 0.45 + (Math.random() * 0.1); // Low confidence for unknown
  let cleanName = rawInput.trim();

  // Simple heuristic matching to simulate an LLM's classification
  for (const [category, keywords] of Object.entries(MERCHANT_KNOWLEDGE_BASE)) {
    for (const keyword of keywords) {
      if (normalizedInput.includes(keyword)) {
        matchedCategory = category as CategoryId;
        
        // Generate a high, realistic-looking confidence score (85% to 98%)
        confidence = 0.85 + Math.random() * 0.13;
        
        // "AI" cleans up the merchant name (e.g., "JOLLIBEE DRIVE THRU 012" -> "Jollibee")
        cleanName = keyword
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        break;
      }
    }
    if (confidence > 0.8) break;
  }

  return {
    categoryId: matchedCategory,
    // Format to 2 decimal places
    confidence: Number(confidence.toFixed(2)),
    suggestedMerchantName: cleanName,
  };
};