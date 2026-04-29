-- Migration: 016_add_others_category
--
-- Adds an "Others" expense category to the default seed set. New signups
-- receive 6 categories (Food, Transport, Shopping, Bills, Health, Others)
-- via the trigger. Existing users get "Others" backfilled idempotently.
--
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/016_add_others_category.sql

-- ─────────────────────────────────────────────────────────────────────────
-- Part A: rewrite the seed trigger so new signups get all 6 categories.
-- (No other expense category is touched; keyword dictionary is unchanged.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seed_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO accounts (user_id, name, type, brand_colour, letter_avatar,
                        balance, starting_balance, is_active, is_deletable, sort_order)
  VALUES (NEW.id, 'Cash', 'Cash', '#1C9E4B', 'P', 0, 0, TRUE, FALSE, 0);

  INSERT INTO categories (user_id, name, emoji, tile_bg_colour, text_colour,
                          is_active, is_default, sort_order, category_type)
  VALUES
    (NEW.id, 'Food',      'food',      '#FDF6E3', '#C97A20', TRUE, TRUE, 0, 'expense'),
    (NEW.id, 'Transport', 'transport', '#EEF6FF', '#3A80C0', TRUE, TRUE, 1, 'expense'),
    (NEW.id, 'Shopping',  'shopping',  '#FFF0F3', '#C0503A', TRUE, TRUE, 2, 'expense'),
    (NEW.id, 'Bills',     'bills',     '#F3EFFF', '#7A4AB8', TRUE, TRUE, 3, 'expense'),
    (NEW.id, 'Health',    'health',    '#EFF8F2', '#2d6a4f', TRUE, TRUE, 4, 'expense'),
    (NEW.id, 'Others',    'others',    '#F2EFEC', '#5C5550', TRUE, TRUE, 5, 'expense');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_seed_user_defaults ON users;
CREATE TRIGGER trigger_seed_user_defaults
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION seed_user_defaults();

-- ─────────────────────────────────────────────────────────────────────────
-- Part B: backfill — insert "Others" for every existing user that has at
-- least one expense category. Idempotent: skipped per-user when "Others"
-- already exists (matched case-insensitively against the `emoji` key).
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO categories (user_id, name, emoji, tile_bg_colour, text_colour,
                        is_active, is_default, sort_order, category_type)
SELECT u.user_id,
       'Others',
       'others',
       '#F2EFEC',
       '#5C5550',
       TRUE,
       TRUE,
       5,
       'expense'
FROM (SELECT DISTINCT user_id
      FROM categories
      WHERE category_type = 'expense') u
WHERE NOT EXISTS (
  SELECT 1
  FROM categories x
  WHERE x.user_id = u.user_id
    AND LOWER(x.emoji) = 'others'
    AND x.category_type = 'expense'
);
