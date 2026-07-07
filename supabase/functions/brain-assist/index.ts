declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

/**
 * brain-assist — the LLM ROUTER behind the offline Fino brain
 * (INTELLIGENCE_UPGRADE.md, Phase C).
 *
 * The mobile app calls this ONLY when the on-device brain flagged a turn as
 * low-confidence/fallback and the user has the "ask online when unsure"
 * toggle on. The request carries NOTHING but the message text — no balances,
 * no transactions, no ids. The model's entire job is to pick one intent from
 * the catalog and rewrite the message as a short canonical query; the device
 * re-runs its offline pipeline on the rewrite and renders its own typed
 * cards. The model never answers and never sees or produces the user's
 * numbers, so a hallucination can at worst waste one clarify.
 *
 * ⚠️ The catalog below mirrors `src/intelligence/convo/intents.ts` +
 * `convo/assistCatalog.ts`. When an intent is added there, add a line here
 * and redeploy: `supabase functions deploy brain-assist`.
 */

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

const CATALOG = `
help — "what can you do"
balance — "what's my balance"
income — "how much did I earn this month"
spend — "how much did I spend on food this month"
breakdown — "give me a spending breakdown"
topCategory — "what's my biggest expense category"
compare — "compare this month to last month"
cut — "where can I cut back"
savings — "am I on track to save"
count — "how many times did I buy coffee this month"
coach — "how am I doing this month"
overspend — "am I overspending anywhere"
transactions — "show me my last 5 transactions"
categoryOf — "which category was my Spotify payment"
salaryStatus — "did my salary hit yet"
billStatus — "did I pay my internet bill"
summary — "summarize my spending this month"
budgetStatus — "am I on track to stay under my budget"
needsVsWants — "show me my needs vs wants"
dowPattern — "what day do I spend the most"
incomeShare — "what percent of my income goes to rent"
trend — "is my transport spending trending up"
typicalSpend — "how much do I typically spend on coffee"
subscriptionCut — "how can I cut my subscription costs"
emergencyFund — "help me build an emergency fund"
goalPlan — "I want to save for a new laptop"
bonusAdvice — "what should I do with my bonus"
improveSavings — "how can I improve my savings rate"
cutAmount — "where can I cut 2000 this month"
ruleOfThumb — "how should I budget my salary"
impulseTips — "tips to avoid impulse buying"
afford — "can I afford a 2000 dinner"
debt — "who owes me money"
safeToSpend — "how much is safe to spend"
reCategorize — "move my Grab ride to Transport"
splitBill — "split the bill with 3 friends"
runway — "how long will my money last"
explainSpend — "why is my spending so high"
monthPattern — "which month did I spend the most"
upcomingBills — "what bills are coming up"
setBudget — "set a budget of 5000 for food"
deleteTransaction — "delete my last transaction"
transfer — "transfer 500 from GCash to Maya"
reminder — "remind me to pay my electric bill"`.trim();

const SYSTEM = `You route messages for Fino, a Filipino budgeting app with an on-device assistant.
The user's message was NOT understood by the on-device parser (typos, slang, Taglish, or unusual phrasing).
Your ONLY job: pick the single closest intent from the catalog and rewrite the message as a short canonical English query with the SAME meaning. Keep any amounts, item/category names, merchants, people, and dates the user mentioned; fix typos. Do not add information the user didn't give. Do not answer the question.
Special cases:
- If the user is REPORTING money they spent/received (a log entry, not a question), use intent "log" and rewrite as "<item> <amount>" (e.g. "ice cream 20"). If no amount was given, still use "log" with just the item.
- If the message has nothing to do with personal finance, or you cannot place it, use intent "none" with an empty query.
Reply with ONLY minified JSON, no markdown: {"intent":"...","query":"..."}

Catalog (intent — canonical example):
${CATALOG}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    if (typeof message !== 'string' || !message.trim()) {
      return json({ error: 'message is required' }, 400);
    }
    // The offline brain only escalates short chat turns; anything huge is not
    // a legitimate assist request. Hard-cap to keep tokens/abuse bounded.
    const trimmed = message.trim().slice(0, 280);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured' }, 500);
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM}\n\nUser message: ${trimmed}` }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 120,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiResponse.ok) {
      const details = await geminiResponse.text();
      return json({ error: 'Gemini API error', details }, 502);
    }

    const data = await geminiResponse.json();
    const rawText: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      // Shape-check only; the app re-validates against its own intent list.
      if (typeof parsed?.intent !== 'string') throw new Error('no intent');
      return json({
        intent: parsed.intent,
        query: typeof parsed.query === 'string' ? parsed.query : '',
      });
    } catch {
      return json({ error: 'Unparseable model reply', raw: rawText }, 502);
    }
  } catch (err) {
    return json({ error: 'brain-assist failed', details: String(err) }, 500);
  }
});
