import vision from '@google-cloud/vision';

// Instantiates a client
const visionClient = new vision.ImageAnnotatorClient();

export interface ParsedField<T> {
  value: T;
  confidence: number;
}

export interface ParseReceiptResponse {
  merchant: ParsedField<string | null>;
  amount: ParsedField<number | null>;
  date: ParsedField<string | null>;
}

export const analyzeReceiptImage = async (base64Data: string): Promise<ParseReceiptResponse> => {
  const [result] = await visionClient.textDetection({
    image: { content: base64Data },
  });

  const text = result.textAnnotations?.[0]?.description || '';
  return extractDataFromText(text);
};

const extractDataFromText = (text: string): ParseReceiptResponse => {
  const normalizedText = text.toUpperCase();
  
  // Extract Merchant
  let merchant: ParsedField<string | null> = { value: null, confidence: 0 };
  if (normalizedText.includes('GCASH')) {
    merchant = { value: 'GCash', confidence: 0.95 };
  } else if (normalizedText.includes('MAYA')) {
    merchant = { value: 'Maya', confidence: 0.95 };
  } else if (normalizedText.includes('BDO')) {
    merchant = { value: 'BDO', confidence: 0.95 };
  } else if (normalizedText.includes('BPI')) {
    merchant = { value: 'BPI', confidence: 0.95 };
  } else {
    merchant = { value: 'Unknown', confidence: 0.40 };
  }

  // Extract Amount
  let amount: ParsedField<number | null> = { value: null, confidence: 0 };
  const amountMatch = text.match(/(?:PHP|₱|P|AMOUNT)\s*[:]?\s*([\d,]+\.\d{2})/i) || text.match(/([\d,]+\.\d{2})/);
  
  if (amountMatch) {
    const parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
    amount = { value: parsedAmount, confidence: 0.90 };
  }

  // Extract Date
  let date: ParsedField<string | null> = { value: null, confidence: 0 };
  const dateMatch = text.match(/\d{2,4}[-/]\d{2}[-/]\d{2,4}|\d{2}\s[A-Z]{3}\s\d{4}/i);
  
  if (dateMatch) {
    date = { value: dateMatch[0], confidence: 0.88 };
  }

  return { merchant, amount, date };
};