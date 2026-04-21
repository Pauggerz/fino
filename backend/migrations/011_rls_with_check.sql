-- Migration: 011_rls_with_check
-- Fixes 010_enable_rls by adding WITH CHECK clauses so INSERT/UPDATE are
-- actually gated to the owner. Without WITH CHECK a client can write rows
-- with a forged user_id and the policy only inspects reads/deletes.
--
-- Also extends RLS to the tables added after 010: debts, savings_goals.
-- (bill_reminders and merchant_mappings already in 010.)
--
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/011_rls_with_check.sql

-- ── Replace existing policies with USING + WITH CHECK pairs ─────────────────

DROP POLICY IF EXISTS "users_own"             ON users;
DROP POLICY IF EXISTS "accounts_own"          ON accounts;
DROP POLICY IF EXISTS "transactions_own"      ON transactions;
DROP POLICY IF EXISTS "categories_own"        ON categories;
DROP POLICY IF EXISTS "merchant_mappings_own" ON merchant_mappings;
DROP POLICY IF EXISTS "bill_reminders_own"    ON bill_reminders;

CREATE POLICY "users_own" ON users
  USING      (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

CREATE POLICY "accounts_own" ON accounts
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "transactions_own" ON transactions
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "categories_own" ON categories
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "merchant_mappings_own" ON merchant_mappings
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "bill_reminders_own" ON bill_reminders
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

-- ── Extend RLS to post-010 tables ──────────────────────────────────────────

ALTER TABLE debts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "debts_own"          ON debts;
DROP POLICY IF EXISTS "savings_goals_own"  ON savings_goals;

CREATE POLICY "debts_own" ON debts
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "savings_goals_own" ON savings_goals
  USING      (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);
