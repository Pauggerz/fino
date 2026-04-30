declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json();

    if (!imageBase64) {
      return json({ error: 'imageBase64 is required' }, 400);
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const prompt = `You are a receipt parser for a Filipino budgeting app.

Analyze this receipt image and extract the following fields.
Return ONLY a valid JSON object with no markdown, no backticks,
no explanation — just the raw JSON.

JSON format to return:
{
  "merchant": { "value": string or null, "confidence": number },
  "amount": { "value": number or null, "confidence": number },
  "date": { "value": string or null, "confidence": number },
  "wallet": { "value": string or null, "confidence": number },
  "account": { "value": string or null, "confidence": number },
  "category": { "value": string or null, "confidence": number }
}

Rules:
- merchant: the store, biller, or recipient name.
  NOT the wallet provider (GCash/Maya/BDO).
  For GCash Send receipts, use the recipient name.
  For GBills receipts, use the biller name (e.g. "Meralco", "Globe").
- amount: the total amount paid as a number only, no currency symbol.
  Use the largest/final amount if multiple amounts shown.
- date: the transaction date as a readable string
  (e.g. "Mar 31, 2026" or "April 3, 2026").
- wallet: the payment provider detected from text — GCash, Maya, BDO, BPI,
  GoTyme, UnionBank, or null if unknown.
- account: the app or bank the screenshot was taken FROM, identified by
  the UI design, colors, logo, or layout (not just the text).
  Examples: "GCash" (blue UI), "Maya" (dark/purple UI), "BDO" (blue/gold),
  "BPI" (red), "GoTyme" (teal), "UnionBank". Use null if unrecognizable.
- category: the spending category. Must be exactly one of:
  "food", "transport", "shopping", "bills", "health", "other".
  Guidelines:
    food      → restaurants, fast food, groceries, coffee shops, convenience stores
    transport → Grab, Angkas, toll, fuel, parking, MRT/LRT, bus, tricycle, jeep
    shopping  → malls, online shops (Shopee, Lazada), clothing, gadgets, laundry,
                laundromat, personal care, salon, barber
    bills     → utilities (Meralco, PLDT, Globe, Converge, Maynilad), rent,
                insurance, subscriptions (Netflix, Spotify)
    health    → pharmacy, hospital, clinic, dental, medical, Watsons, Mercury Drug
    other     → money transfers (GCash Send), ATM withdrawal, unclear/unrecognizable
- confidence: 0.0 to 1.0. Use 0.9+ only when very certain.
  Use 0.5 to 0.7 when partially uncertain.
  Use 0.3 or below when guessing.

If a field cannot be found, set value to null and confidence to 0.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 700, thinkingConfig: { thinkingBudget: 0 } },
    });

    // Retry once on 429 (rate-limit), waiting the suggested delay (capped at 10 s).
    let geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: geminiBody,
    });

    if (geminiResponse.status === 429) {
      const retryAfterMs = await (async () => {
        try {
          const body = await geminiResponse.clone().json();
          const delaySec = body?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay;
          if (delaySec) return Math.min(parseInt(delaySec) * 1000, 10_000);
        } catch { /* ignore */ }
        return 3_000;
      })();
      await new Promise((r) => setTimeout(r, retryAfterMs));
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      });
    }

    if (!geminiResponse.ok) {
      const details = await geminiResponse.text();
      return json({ error: 'Gemini API error', details }, 500);
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      return json(JSON.parse(cleanJson));
    } catch {
      return json({ error: 'Failed to parse Gemini response', raw: rawText }, 500);
    }

  } catch (err) {
    return json({ error: 'Failed to process receipt', details: String(err) }, 500);
  }
});
