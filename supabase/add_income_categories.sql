-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add income categories
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add a category_type column to distinguish expense vs income categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'expense'
  CHECK (category_type IN ('expense', 'income'));

-- 2. Mark existing categories as expense type
UPDATE categories
SET category_type = 'expense'
WHERE category_type = 'expense'; -- no-op, default already set

-- 3. Insert income categories for each user that already has expense categories
--    (replace the SELECT with a specific user_id if you want to insert for one user)
INSERT INTO categories (user_id, name, emoji, tile_bg_colour, text_colour, budget_limit, is_active, is_default, sort_order, category_type)
SELECT
  user_id,
  cat.name,
  cat.emoji,
  cat.tile_bg_colour,
  cat.text_colour,
  NULL,     -- no budget limit for income
  TRUE,
  TRUE,
  cat.sort_order,
  'income'
FROM (
  SELECT DISTINCT user_id FROM categories WHERE category_type = 'expense'
) users
CROSS JOIN (
  VALUES
    ('Salary',     'salary',     '#EFF8F2', '#2d6a4f', 10),
    ('Allowance',  'allowance',  '#EEF6FF', '#3A80C0', 11),
    ('Freelance',  'freelance',  '#F3EFFF', '#7A4AB8', 12),
    ('Business',   'business',   '#FDF6E3', '#C97A20', 13),
    ('Gifts',      'gifts',      '#FFF0F3', '#C0503A', 14),
    ('Investment', 'investment', '#E8F6F5', '#1a7a6e', 15),
    ('Others',     'default',    '#F7F5F2', '#888780', 16)
) AS cat(name, emoji, tile_bg_colour, text_colour, sort_order)
ON CONFLICT DO NOTHING;
