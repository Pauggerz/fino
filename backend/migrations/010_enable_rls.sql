-- Migration: 010_enable_rls
-- Enables Row Level Security on all tables
-- Users can only read and write their own data
-- auth.uid() matches the user_id from Supabase Auth
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/010_enable_rls.sql

-- Enable RLS on all tables
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_reminders      ENABLE ROW LEVEL SECURITY;

-- users: can only see and edit your own row
CREATE POLICY "users_own" ON users
  USING (auth.uid()::text = id::text);

-- accounts: can only see and edit your own accounts
CREATE POLICY "accounts_own" ON accounts
  USING (auth.uid()::text = user_id::text);

-- transactions: can only see and edit your own transactions
CREATE POLICY "transactions_own" ON transactions
  USING (auth.uid()::text = user_id::text);

-- categories: can only see and edit your own categories
CREATE POLICY "categories_own" ON categories
  USING (auth.uid()::text = user_id::text);

-- merchant_mappings: can only see and edit your own mappings
CREATE POLICY "merchant_mappings_own" ON merchant_mappings
  USING (auth.uid()::text = user_id::text);

-- bill_reminders: can only see and edit your own reminders
CREATE POLICY "bill_reminders_own" ON bill_reminders
  USING (auth.uid()::text = user_id::text);
