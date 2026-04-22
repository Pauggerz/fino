-- Add last_reconciled_at to accounts.
--
-- The client writes this column (localMutations.ts::reconcileAccount) after
-- every balance reconcile and reads it in AccountDetailScreen to show the
-- "Last reconciled…" label. The server table never had the column, so every
-- push of an account row now fails with PGRST204 ("Could not find the
-- 'last_reconciled_at' column of 'accounts' in the schema cache").
--
-- Idempotent: re-running is a no-op.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;
