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

    const prompt = `You are a receipt line-item extractor for a Filipino bill-splitting app.

Analyze this receipt image and extract ALL individual items/products ordered.
Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

JSON format:
{
  "merchant": string or null,
  "items": [
    { "name": string, "quantity": number, "unit_price": number, "price": number }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "service_charge": number or null,
  "total": number or null
}

Rules:

QUANTITY EXTRACTION (critical):
- Receipts often show quantity as "4 x ITEM", "4x ITEM", "ITEM x4", "ITEM (4)", "4 pcs", "qty 4", etc.
- Always extract the numeric quantity and put it in "quantity"
- The "name" field must NEVER contain the quantity prefix/suffix — strip it out
  Example: "4 x MULE ESPRESSO" → name: "MULE ESPRESSO", quantity: 4
  Example: "Burger x2" → name: "Burger", quantity: 2
- Default quantity to 1 only when truly no quantity is shown

PRICE EXTRACTION:
- unit_price: the price for ONE unit (if shown, otherwise calculate from total ÷ quantity)
- price: the TOTAL price for that line item (unit_price × quantity), as a plain number (no ₱ symbol)
- If the receipt shows only one price column for a multi-qty row, it is the TOTAL — calculate unit_price = total ÷ quantity
- If the receipt shows both unit price and total, use both directly

OTHER RULES:
- Do NOT include subtotal, tax, VAT, service charge, or discount rows as items
- Combos/sets: list as one item with quantity 1 unless the receipt explicitly shows qty > 1
- subtotal/tax/service_charge/total: extract if visible, otherwise null
- Return an empty items array if no individual items can be identified`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
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
