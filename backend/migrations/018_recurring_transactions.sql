-- Migration: 018_recurring_transactions
-- Two new tables backing the "Recurring Transactions" tool: scheduled income
-- (salary, allowance, retainers) and scheduled outflows (rent, subs, utilities).
-- The client computes next_due_at; the server stores it as authoritative state
-- so feed/insight queries can range-scan upcoming items without re-deriving.
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/018_recurring_transactions.sql

CREATE TABLE IF NOT EXISTS recurring_incomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  cadence         VARCHAR(20) NOT NULL CHECK (cadence IN ('weekly','monthly','yearly')),
  anchor_date     DATE NOT NULL,
  next_due_at     DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_posted_at  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recurring_incomes_user_id_idx ON recurring_incomes(user_id);
CREATE INDEX IF NOT EXISTS recurring_incomes_next_due_idx ON recurring_incomes(user_id, next_due_at);

CREATE TABLE IF NOT EXISTS recurring_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category        VARCHAR(100),
  cadence         VARCHAR(20) NOT NULL CHECK (cadence IN ('weekly','monthly','yearly')),
  anchor_date     DATE NOT NULL,
  next_due_at     DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_paid_at    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recurring_bills_user_id_idx ON recurring_bills(user_id);
CREATE INDEX IF NOT EXISTS recurring_bills_next_due_idx ON recurring_bills(user_id, next_due_at);

-- updated_at trigger so the watermelon sync watermark advances on every write.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recurring_incomes_set_updated_at ON recurring_incomes;
CREATE TRIGGER recurring_incomes_set_updated_at
  BEFORE UPDATE ON recurring_incomes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS recurring_bills_set_updated_at ON recurring_bills;
CREATE TRIGGER recurring_bills_set_updated_at
  BEFORE UPDATE ON recurring_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS — owners only.
ALTER TABLE recurring_incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_bills   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own recurring_incomes" ON recurring_incomes;
CREATE POLICY "Users manage own recurring_incomes"
  ON recurring_incomes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own recurring_bills" ON recurring_bills;
CREATE POLICY "Users manage own recurring_bills"
  ON recurring_bills FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
