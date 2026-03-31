import vision from '@google-cloud/vision';

const visionClient = new vision.ImageAnnotatorClient();

export interface ParsedField<T> {
  value: T;
  confidence: number;
}

export interface ParseReceiptResponse {
  merchant: ParsedField<string | null>;
  amount: ParsedField<number | null>;
  date: ParsedField<string | null>;
  wallet: ParsedField<string | null>;
}

export const analyzeReceiptImage = async (
  base64Data: string
): Promise<ParseReceiptResponse> => {
  const [result] = await visionClient.textDetection({
    image: { content: base64Data },
  });

  const text = result.textAnnotations?.[0]?.description || '';
  const allAnnotations = result.textAnnotations || [];
  return extractDataFromText(text, allAnnotations);
};

const KNOWN_MERCHANTS: Record<string, string> = {
  'JOLLIBEE': 'Jollibee',
  'MCDONALDS': "McDonald's",
  "MCDONALD'S": "McDonald's",
  'KFC': 'KFC',
  'CHOWKING': 'Chowking',
  'MANG INASAL': 'Mang Inasal',
  'GREENWICH': 'Greenwich',
  'STARBUCKS': 'Starbucks',
  'SM': 'SM',
  'ROBINSONS': 'Robinsons',
  'SHOPEE': 'Shopee',
  'LAZADA': 'Lazada',
  'MERALCO': 'Meralco',
  'PLDT': 'PLDT',
  'GLOBE': 'Globe',
  'SMART': 'Smart',
  'MERCURY DRUG': 'Mercury Drug',
  'WATSONS': 'Watsons',
  'NATIONAL BOOKSTORE': 'National Bookstore',
  '7-ELEVEN': '7-Eleven',
  'MINISTOP': 'Ministop',
  'FAMILYMART': 'FamilyMart',
  'GRAB': 'Grab',
  'ANGKAS': 'Angkas',
  'PETRON': 'Petron',
  'SHELL': 'Shell',
};

const WALLET_PROVIDERS = ['GCASH', 'MAYA', 'BDO', 'BPI', 'GOTYME', 'UNIONBANK'];

const extractDataFromText = (
  text: string,
  _annotations: any[]
): ParseReceiptResponse => {
  const normalizedText = text.toUpperCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // --- Merchant ---
  let merchant: ParsedField<string | null> = { value: null, confidence: 0 };

  const skipPatterns = [
    /^\d{1,2}:\d{2}/,        // timestamps like "10:38"
    /^\+63/,                   // phone numbers
    /^ref/i,                   // reference number lines
    /^\d+$/,                   // pure numbers
    /^\d{10,}/,                // long number strings (ref numbers)
    /^[a-z]$/i,               // single letters
    /sent via/i,               // "Sent via GCash"
    /payment received/i,       // GCash header
    /using your/i,             // "using your GCash"
    /^amount$/i,               // field label "Amount"
    /^fee$/i,                  // field label "Fee"
    /^total/i,                 // "Total Amount Sent"
    /account number/i,
    /amount paid/i,
    /this has been/i,
    /save biller/i,
    /gcash pay/i,
    /gbills/i,
  ];

  // TYPE 1: GCash Send (person to person)
  if (normalizedText.includes('EXPRESS SEND')) {
    const expressIndex = lines.findIndex(l => /express send/i.test(l));
    if (expressIndex !== -1) {
      // Recipient name is the first line after "Express Send" that passes skipPatterns
      for (let i = expressIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 2 && !skipPatterns.some(p => p.test(line))) {
          merchant = { value: line, confidence: 0.80 };
          break;
        }
      }
    }
  }

  // TYPE 2: GCash Pay Bills
  if (!merchant.value && (normalizedText.includes('GBILLS') || (normalizedText.includes('PAYMENT RECEIVED') && normalizedText.includes('PHP')))) {
    // Biller name appears before the PHP amount line; ignore ad banners
    const phpLineIndex = lines.findIndex(l => /^PHP\s+[\d,]+\.\d{2}$|^₱\s*[\d,]+\.\d{2}$/.test(l));
    const gbillsIndex = lines.findIndex(l => /gbills/i.test(l));
    const startIndex = gbillsIndex !== -1 ? gbillsIndex + 1 : 0;
    const endIndex = phpLineIndex !== -1 ? phpLineIndex : lines.length;
    const billerLine = lines.slice(startIndex, endIndex).find(line =>
      line.length > 2 && !skipPatterns.some(p => p.test(line))
    );
    if (billerLine) {
      merchant = { value: billerLine, confidence: 0.90 };
    }
  }

  // TYPE 3: Known merchant names
  if (!merchant.value) {
    for (const [key, displayName] of Object.entries(KNOWN_MERCHANTS)) {
      if (normalizedText.includes(key)) {
        merchant = { value: displayName, confidence: 0.92 };
        break;
      }
    }
  }

  // Fallback: skip lines that look like timestamps, phone numbers, or reference numbers
  if (!merchant.value) {
    const candidateLine = lines.find(line =>
      line.length > 2 &&
      !skipPatterns.some(pattern => pattern.test(line))
    );

    if (candidateLine) {
      merchant = { value: candidateLine, confidence: 0.55 };
    } else {
      merchant = { value: 'Unknown', confidence: 0.30 };
    }
  }

  // Strip single-letter OCR prefix (e.g. "A APMC" → "APMC")
  if (merchant.value && /^[A-Z]\s+/.test(merchant.value)) {
    merchant = {
      value: merchant.value.replace(/^[A-Z]\s+/, '').trim(),
      confidence: merchant.confidence,
    };
  }

  // --- Wallet provider (separate from merchant) ---
  let wallet: ParsedField<string | null> = { value: null, confidence: 0 };
  for (const provider of WALLET_PROVIDERS) {
    if (normalizedText.includes(provider)) {
      wallet = {
        value: provider === 'GCASH' ? 'GCash' :
               provider === 'MAYA' ? 'Maya' :
               provider === 'GOTYME' ? 'GoTyme' :
               provider === 'UNIONBANK' ? 'UnionBank' :
               provider,
        confidence: 0.95,
      };
      break;
    }
  }

  // --- Amount ---
  let amount: ParsedField<number | null> = { value: null, confidence: 0 };

  // High confidence: explicit label before amount
  const labeledMatch = text.match(
    /(?:TOTAL|AMOUNT|PHP|₱|GRAND TOTAL)[:\s]*([₱P]?\s*[\d,]+\.\d{2})/i
  );
  if (labeledMatch) {
    const parsed = parseFloat(labeledMatch[1].replace(/[₱P,\s]/g, ''));
    if (!isNaN(parsed)) {
      amount = { value: parsed, confidence: 0.93 };
    }
  }

  // Medium confidence: any decimal number
  if (!amount.value) {
    const anyAmount = text.match(/([\d,]+\.\d{2})/);
    if (anyAmount) {
      const parsed = parseFloat(anyAmount[1].replace(/,/g, ''));
      if (!isNaN(parsed)) {
        amount = { value: parsed, confidence: 0.72 };
      }
    }
  }

  // --- Date ---
  let date: ParsedField<string | null> = { value: null, confidence: 0 };

  // High confidence: labeled date
  const labeledDate = text.match(
    /(?:DATE|DATE\/TIME)[:\s]*(.+)/i
  );

  // Medium confidence: GCash date formats
  const gcashDate = text.match(
    /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i
  );

  // Lower confidence: numeric formats
  const numericDate = text.match(
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}/
  );

  if (labeledDate) {
    date = { value: labeledDate[1].trim(), confidence: 0.92 };
  } else if (gcashDate) {
    date = { value: gcashDate[0], confidence: 0.88 };
  } else if (numericDate) {
    date = { value: numericDate[0], confidence: 0.75 };
  }

  return { merchant, amount, date, wallet };
};
