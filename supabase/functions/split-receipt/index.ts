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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // @ts-ignore
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prompt = `You are a receipt line-item extractor for a Filipino bill-splitting app.

Analyze this receipt image and extract ALL individual items/products ordered.
Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

JSON format:
{
  "merchant": string or null,
  "items": [
    { "name": string, "price": number, "quantity": number }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "service_charge": number or null,
  "total": number or null
}

Rules:
- items: every individual line item visible on the receipt
- price: the TOTAL for that line item (quantity × unit price), as a plain number (no ₱ symbol)
- quantity: number of units ordered — default to 1 if not shown
- Do NOT include subtotal, tax, VAT, service charge, or discount rows as items
- If the receipt shows a set/combo, list it as one item
- Preserve the original item names from the receipt
- subtotal/tax/service_charge/total: extract if visible, otherwise null
- Return an empty items array if no individual items can be identified`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return new Response(
        JSON.stringify({ error: 'Gemini API error', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse Gemini response', raw: rawText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to process receipt', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
