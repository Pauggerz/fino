import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from './middleware/auth';
import receiptRoutes from './routes/receipt.routes';
import { parseReceipt } from './controllers/receipt.controller';

dotenv.config({ path: '../.env.local' });

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Public Route: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Fino API is running smoothly',
  });
});

// Protected Route: Test
app.get('/api/protected-test', requireAuth, (req, res) => {
  res.json({
    message: 'Success! You have a valid Supabase JWT.',
    user: (req as any).user,
  });
});

// Temporary test route (no auth) — dev environments only.
// Must never be reachable in production since it would let anyone burn our Gemini quota.
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/parse-receipt-test', parseReceipt);

  // Dev-only: send a test push to the calling user's active devices so the
  // end-to-end pipeline (token capture → Expo → receive → inbox) can be
  // validated without waiting for cron. Gated identically to the route above.
  app.post('/api/push/test', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const bearer = (req.headers.authorization || '').split(' ')[1];
      const userClient = createClient(
        process.env.SUPABASE_URL || '',
        process.env.SUPABASE_ANON_KEY || '',
        { global: { headers: { Authorization: `Bearer ${bearer}` } } }
      );

      const { data: rows, error } = await userClient
        .from('push_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const tokens = (rows || []).map((r: any) => r.token as string);
      if (tokens.length === 0) {
        res.status(404).json({ error: 'No active push tokens for this user' });
        return;
      }

      const title = req.body?.title || 'Fino test push';
      const body =
        req.body?.body || 'If you can read this, push works end-to-end.';
      const messages = tokens.map((to) => ({
        to,
        title,
        body,
        sound: 'default',
        channelId: 'general',
        data: {
          v: 1,
          kind: `dev-test:${Date.now()}`,
          route: 'Notifications',
          notification_type: 'tip',
          inboxInsert: true,
          title,
          body,
        },
      }));

      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(messages),
      });
      const result = await expoRes.json();
      res.json({ sent: tokens.length, expo: result });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'push test failed' });
    }
  });
}

// Register grouped routes
app.use('/api', receiptRoutes);

app.listen(port, () => {
  console.log(`🚀 Fino API listening on port ${port}`);
});
