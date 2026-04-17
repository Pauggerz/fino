import type { GenerativeModel } from '@google/generative-ai';

const SYSTEM_INSTRUCTION = `You are Fino Intelligence, a personal
finance assistant built into the Fino budgeting app for
Filipino users.

Your role:
- Answer questions about the user's spending, income,
  and budgets based on the financial data provided in
  each message
- Give practical, friendly financial insights
- Keep responses short and conversational — 2 to 3
  sentences unless the user asks for detail
- Never make up transaction data — only use what is
  provided in the context below
- Use ₱ for all amounts
- When the user asks about spending, reference specific
  categories and amounts from their data
- Tone: friendly and encouraging, like a kuya or ate
  who knows finance — not formal, not robotic

Language rules:
- Default language is ENGLISH. Always respond in English
  unless the user clearly writes in Filipino or Taglish.
- If the user writes in Filipino (Tagalog), respond in Filipino.
- If the user mixes English and Tagalog (Taglish), match
  that same mix.
- You can understand Filipino, Tagalog, and Taglish input
  regardless of what language you reply in.`;

// Lazily instantiate the Gemini client on first use so cold start
// doesn't pay for SDK initialization the user may never trigger.
let cachedModel: GenerativeModel | null = null;
let apiKeyWarned = false;

const getModel = async (): Promise<GenerativeModel> => {
  if (cachedModel) return cachedModel;

  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
  if (!apiKey && !apiKeyWarned) {
    apiKeyWarned = true;
    console.warn(
      '[Fino AI] EXPO_PUBLIC_GEMINI_API_KEY is not set. ' +
        'Add it to your .env file and restart Expo with --clear.'
    );
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  cachedModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });
  return cachedModel;
};

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface UserFinancialContext {
  totalBalance: number;
  monthlyIncome: number;
  monthlySpent: number;
  totalBudget: number | null;
  categoryBreakdown: {
    name: string;
    spent: number;
    budget: number | null;
  }[];
  recentTransactions: {
    display_name: string | null;
    amount: number;
    type: string;
    category: string | null;
    date: string;
  }[];
}

export const sendMessage = async (
  userMessage: string,
  history: ChatMessage[],
  financialContext: UserFinancialContext
): Promise<string> => {
  const contextBlock = `
CURRENT USER FINANCIAL DATA (use this to answer questions):
- Total balance across all accounts: ₱${financialContext.totalBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
- Income this month: ₱${financialContext.monthlyIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
- Spent this month: ₱${financialContext.monthlySpent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
- Monthly budget limit: ${financialContext.totalBudget ? `₱${financialContext.totalBudget.toLocaleString('en-PH')}` : 'Not set'}

SPENDING BY CATEGORY THIS MONTH:
${financialContext.categoryBreakdown
  .map(
    (c) =>
      `- ${c.name}: ₱${c.spent.toLocaleString('en-PH', { minimumFractionDigits: 2 })}${c.budget ? ` (budget: ₱${c.budget.toLocaleString('en-PH')})` : ''}`
  )
  .join('\n')}

RECENT TRANSACTIONS (last 10):
${financialContext.recentTransactions
  .map(
    (t) =>
      `- ${t.display_name || t.category || 'Unknown'}: ${t.type === 'expense' ? '-' : '+'}₱${t.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} (${t.category ?? 'uncategorized'}, ${new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })})`
  )
  .join('\n')}
  `.trim();

  const model = await getModel();
  const chat = model.startChat({
    history: history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
  });

  const messageWithContext =
    history.length === 0
      ? `${contextBlock}\n\nUser: ${userMessage}`
      : userMessage;

  const result = await chat.sendMessage(messageWithContext);
  return result.response.text();
};

export const generateBulletInsights = async (
  prompt: string
): Promise<string[]> => {
  try {
    const model = await getModel();
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed.slice(0, 3).map(String);
    }
  } catch (_) {}
  return [];
};
