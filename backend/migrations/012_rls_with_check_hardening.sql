-- Migration: 012_rls_with_check_hardening
-- Ensures owner policies always enforce writes with WITH CHECK.
-- Safe to run repeatedly.

ALTER TABLE IF EXISTS users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS merchant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bill_reminders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS debts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS savings_goals     ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "users_own" ON public.users';
    EXECUTE $sql$
      CREATE POLICY "users_own" ON public.users
      USING      (auth.uid()::text = id::text)
      WITH CHECK (auth.uid()::text = id::text)
    $sql$;
  END IF;

  IF to_regclass('public.accounts') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "accounts_own" ON public.accounts';
    EXECUTE $sql$
      CREATE POLICY "accounts_own" ON public.accounts
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;

  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "transactions_own" ON public.transactions';
    EXECUTE $sql$
      CREATE POLICY "transactions_own" ON public.transactions
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;

  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "categories_own" ON public.categories';
    EXECUTE $sql$
      CREATE POLICY "categories_own" ON public.categories
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;

  IF to_regclass('public.merchant_mappings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "merchant_mappings_own" ON public.merchant_mappings';
    EXECUTE $sql$
      CREATE POLICY "merchant_mappings_own" ON public.merchant_mappings
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;

  IF to_regclass('public.bill_reminders') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "bill_reminders_own" ON public.bill_reminders';
    EXECUTE $sql$
      CREATE POLICY "bill_reminders_own" ON public.bill_reminders
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;

  IF to_regclass('public.debts') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "debts_own" ON public.debts';
    EXECUTE $sql$
      CREATE POLICY "debts_own" ON public.debts
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;

  IF to_regclass('public.savings_goals') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "savings_goals_own" ON public.savings_goals';
    EXECUTE $sql$
      CREATE POLICY "savings_goals_own" ON public.savings_goals
      USING      (auth.uid()::text = user_id::text)
      WITH CHECK (auth.uid()::text = user_id::text)
    $sql$;
  END IF;
END
$$;
