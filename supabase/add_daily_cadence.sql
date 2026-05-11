-- 1. Allow 'daily' as a valid cadence for recurring bills and incomes.
-- The original CHECK constraints only permitted 'weekly' | 'monthly' | 'yearly',
-- which made sync fail with "violates check constraint *_cadence_check" once
-- the app started writing 'daily' rows.

ALTER TABLE recurring_incomes
  DROP CONSTRAINT IF EXISTS recurring_incomes_cadence_check;

ALTER TABLE recurring_incomes
  ADD CONSTRAINT recurring_incomes_cadence_check
  CHECK (cadence IN ('daily', 'weekly', 'monthly', 'yearly'));

ALTER TABLE recurring_bills
  DROP CONSTRAINT IF EXISTS recurring_bills_cadence_check;

ALTER TABLE recurring_bills
  ADD CONSTRAINT recurring_bills_cadence_check
  CHECK (cadence IN ('daily', 'weekly', 'monthly', 'yearly'));

-- 2. Add category column to recurring_incomes so incomes can carry their own
-- category (Salary, Allowance, Freelance, …) that flows into the transaction
-- created when the user taps "Mark Received".

ALTER TABLE recurring_incomes
  ADD COLUMN IF NOT EXISTS category text;

-- 3. Force PostgREST to refresh its schema cache so the new column is visible
-- to the API immediately. Without this, the next sync push fails with
-- PGRST204 ("Could not find the 'category' column … in the schema cache")
-- until the API restarts on its own.

NOTIFY pgrst, 'reload schema';
