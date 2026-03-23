import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requireAuth } from './middleware/auth';

dotenv.config({ path: '../.env.local' });

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Public Route: Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'Fino API is running smoothly'
  });
});

// Protected Route: Test
app.get('/api/protected-test', requireAuth, (req, res) => {
  res.json({ 
    message: 'Success! You have a valid Supabase JWT.', 
    user: (req as any).user 
  });
});

app.listen(port, () => {
  console.log(`🚀 Fino API listening on port ${port}`);
});