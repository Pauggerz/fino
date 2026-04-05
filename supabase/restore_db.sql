-- ─────────────────────────────────────────────────────────────────────────────
-- Fino DB Restoration Script
-- Undoes coworker damage and restores the database to its original state.
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (fully idempotent).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── STEP 1: Remove income categories added by mistake ────────────────────────
-- The coworker inserted income categories into the categories table.
-- These do not belong in the DB — income is handled purely in app code.

DELETE FROM categories
WHERE emoji IN (
  'salary', 'allowance', 'freelance', 'business',
  'gifts', 'investment', 'default'
)
AND name IN (
  'Salary', 'Allowance', 'Freelance', 'Business',
  'Gifts', 'Investment', 'Others'
);


-- ── STEP 2: Drop the category_type column if it was added ────────────────────
-- The coworker added a category_type column that is not part of the schema.

ALTER TABLE categories DROP COLUMN IF EXISTS category_type;


-- ── STEP 3: Restore emoji values for standard expense categories ─────────────
-- The emoji column stores icon key names (e.g. 'food'), not emoji characters.
-- Restore them in case they were overwritten.

UPDATE categories SET emoji = 'food'      WHERE LOWER(name) = 'food';
UPDATE categories SET emoji = 'transport' WHERE LOWER(name) = 'transport';
UPDATE categories SET emoji = 'shopping'  WHERE LOWER(name) = 'shopping';
UPDATE categories SET emoji = 'bills'     WHERE LOWER(name) = 'bills';
UPDATE categories SET emoji = 'health'    WHERE LOWER(name) = 'health';
UPDATE categories SET emoji = 'fun'       WHERE LOWER(name) = 'fun';


-- ── STEP 4: Restore correct tile colors for expense categories ───────────────

UPDATE categories
SET tile_bg_colour = '#FDF6E3', text_colour = '#C97A20'
WHERE LOWER(name) = 'food';

UPDATE categories
SET tile_bg_colour = '#EEF6FF', text_colour = '#3A80C0'
WHERE LOWER(name) = 'transport';

UPDATE categories
SET tile_bg_colour = '#FFF0F3', text_colour = '#C0503A'
WHERE LOWER(name) = 'shopping';

UPDATE categories
SET tile_bg_colour = '#F3EFFF', text_colour = '#7A4AB8'
WHERE LOWER(name) = 'bills';

UPDATE categories
SET tile_bg_colour = '#EFF8F2', text_colour = '#2d6a4f'
WHERE LOWER(name) = 'health';


-- ── STEP 5: Restore the seed function ───────────────────────────────────────
-- Ensures new users get the correct default account + 5 expense categories.

CREATE OR REPLACE FUNCTION seed_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO accounts (
    user_id, name, type, brand_colour, letter_avatar,
    balance, starting_balance, is_active, is_deletable, sort_order
  )
  VALUES (NEW.id, 'Cash', 'Cash', '#1C9E4B', 'P', 0, 0, TRUE, FALSE, 0);

  INSERT INTO categories (
    user_id, name, emoji, tile_bg_colour, text_colour,
    is_active, is_default, sort_order
  )
  VALUES
    (NEW.id, 'Food',      'food',      '#FDF6E3', '#C97A20', TRUE, TRUE, 0),
    (NEW.id, 'Transport', 'transport', '#EEF6FF', '#3A80C0', TRUE, TRUE, 1),
    (NEW.id, 'Shopping',  'shopping',  '#FFF0F3', '#C0503A', TRUE, TRUE, 2),
    (NEW.id, 'Bills',     'bills',     '#F3EFFF', '#7A4AB8', TRUE, TRUE, 3),
    (NEW.id, 'Health',    'health',    '#EFF8F2', '#2d6a4f', TRUE, TRUE, 4);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_seed_user_defaults ON users;
CREATE TRIGGER trigger_seed_user_defaults
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION seed_user_defaults();


-- ── STEP 6: Restore RLS policies (in case they were dropped or altered) ──────

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_reminders    ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to guarantee correct definitions
DROP POLICY IF EXISTS "users_own"             ON users;
DROP POLICY IF EXISTS "accounts_own"          ON accounts;
DROP POLICY IF EXISTS "transactions_own"      ON transactions;
DROP POLICY IF EXISTS "categories_own"        ON categories;
DROP POLICY IF EXISTS "merchant_mappings_own" ON merchant_mappings;
DROP POLICY IF EXISTS "bill_reminders_own"    ON bill_reminders;

CREATE POLICY "users_own"             ON users             USING (auth.uid()::text = id::text);
CREATE POLICY "accounts_own"          ON accounts          USING (auth.uid()::text = user_id::text);
CREATE POLICY "transactions_own"      ON transactions      USING (auth.uid()::text = user_id::text);
CREATE POLICY "categories_own"        ON categories        USING (auth.uid()::text = user_id::text);
CREATE POLICY "merchant_mappings_own" ON merchant_mappings USING (auth.uid()::text = user_id::text);
CREATE POLICY "bill_reminders_own"    ON bill_reminders    USING (auth.uid()::text = user_id::text);


-- ── Done ─────────────────────────────────────────────────────────────────────
-- Verify with:
--   SELECT name, emoji, tile_bg_colour, text_colour FROM categories ORDER BY sort_order;
