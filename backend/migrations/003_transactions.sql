CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(20) NOT NULL,          -- 'expense' | 'income'
  category VARCHAR(50),               -- 'food' | 'transport' | 'shopping' | 'bills' | 'health'
  merchant_name VARCHAR(200),         -- raw OCR output, always keep
  display_name VARCHAR(200),          -- what shows in the feed (description > merchant > 'Unknown')
  transaction_note VARCHAR(500),      -- the "or describe" field value
  signal_source VARCHAR(20),          -- 'description' | 'merchant' | 'time_history' | 'manual'
  date TIMESTAMPTZ NOT NULL,
  receipt_url TEXT,                   -- Supabase Storage URL (only if scanned)
  account_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
