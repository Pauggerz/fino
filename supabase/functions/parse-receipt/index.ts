// @ts-ignore
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// @ts-ignore
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
// @ts-ignore
    const VISION_API_KEY = Deno.env.get('VISION_API_KEY');

    if (!VISION_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'VISION_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Vision API via HTTP
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    );

    const visionData = await visionResponse.json();
    const text = visionData.responses?.[0]?.textAnnotations?.[0]?.description ?? '';

    // Run your existing extraction logic
    const result = extractDataFromText(text);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to process receipt' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── EXTRACTION LOGIC (ported from receipt.service.ts) ──

const KNOWN_MERCHANTS: Record<string, string> = {
  'JOLLIBEE': 'Jollibee', 'MCDONALDS': "McDonald's",
  'KFC': 'KFC', 'CHOWKING': 'Chowking',
  'MANG INASAL': 'Mang Inasal', 'STARBUCKS': 'Starbucks',
  'SHOPEE': 'Shopee', 'LAZADA': 'Lazada',
  'MERALCO': 'Meralco', 'GLOBE': 'Globe',
  'SMART': 'Smart', 'PLDT': 'PLDT',
  'GRAB': 'Grab', 'APMC': 'APMC',
};

const WALLET_PROVIDERS = ['GCASH', 'MAYA', 'BDO', 'BPI', 'GOTYME', 'UNIONBANK'];

const SKIP_PATTERNS = [
  /^\d{1,2}:\d{2}/,
  /^\+63/,
  /^ref/i,
  /^\d+$/,
  /^[a-z]$/i,
  /sent via/i,
  /payment received/i,
  /using your/i,
  /^amount$/i,
  /^fee$/i,
  /^total/i,
  /account number/i,
  /amount paid/i,
  /this has been/i,
  /save biller/i,
  /gcash pay/i,
  /gbills/i,
];

function extractDataFromText(text: string) {
  const normalizedText = text.toUpperCase();
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);

  // Wallet
  let wallet = { value: null as string | null, confidence: 0 };
  for (const provider of WALLET_PROVIDERS) {
    if (normalizedText.includes(provider)) {
      wallet = {
        value: provider === 'GCASH' ? 'GCash'
              : provider === 'MAYA' ? 'Maya'
              : provider === 'GOTYME' ? 'GoTyme'
              : provider,
        confidence: 0.95,
      };
      break;
    }
  }

  // Merchant
  let merchant = { value: null as string | null, confidence: 0 };

  if (normalizedText.includes('EXPRESS SEND')) {
    // GCash Send — recipient name
    const candidate = lines.find(line =>
      line.length > 2 &&
      !SKIP_PATTERNS.some(p => p.test(line)) &&
      !WALLET_PROVIDERS.some(w => line.toUpperCase().includes(w))
    );
    merchant = { value: candidate ?? 'Unknown', confidence: 0.80 };
  } else {
    // Known merchant or biller
    for (const [key, displayName] of Object.entries(KNOWN_MERCHANTS)) {
      if (normalizedText.includes(key)) {
        merchant = { value: displayName, confidence: 0.92 };
        break;
      }
    }
    if (!merchant.value) {
      const candidate = lines.find(line =>
        line.length > 2 &&
        !SKIP_PATTERNS.some(p => p.test(line))
      );
      merchant = { value: candidate ?? 'Unknown', confidence: 0.55 };
    }
  }

  // Fix stray single letter prefix e.g. "A APMC"
  if (merchant.value && /^[A-Z]\s+/.test(merchant.value)) {
    merchant.value = merchant.value.replace(/^[A-Z]\s+/, '').trim();
  }

  // Amount
  let amount = { value: null as number | null, confidence: 0 };
  const labeledMatch = text.match(
    /(?:TOTAL|AMOUNT|PHP|₱|GRAND TOTAL)[:\s]*([₱P]?\s*[\d,]+\.\d{2})/i
  );
  if (labeledMatch) {
    const parsed = parseFloat(labeledMatch[1].replace(/[₱P,\s]/g, ''));
    if (!isNaN(parsed)) amount = { value: parsed, confidence: 0.93 };
  }
  if (!amount.value) {
    const anyAmount = text.match(/([\d,]+\.\d{2})/);
    if (anyAmount) {
      const parsed = parseFloat(anyAmount[1].replace(/,/g, ''));
      if (!isNaN(parsed)) amount = { value: parsed, confidence: 0.72 };
    }
  }

  // Date
  let date = { value: null as string | null, confidence: 0 };
  const gcashDate = text.match(
    /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})/i
  );
  const numericDate = text.match(
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}/
  );
  if (gcashDate) {
    date = { value: gcashDate[0], confidence: 0.88 };
  } else if (numericDate) {
    date = { value: numericDate[0], confidence: 0.75 };
  }

  return { merchant, amount, date, wallet };
}