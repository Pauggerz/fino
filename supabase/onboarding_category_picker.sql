-- Onboarding category picker — abolish auto-seeded defaults.
-- ─────────────────────────────────────────────────────────────────────────────
-- Before this change, signup auto-created 5 categories (Food, Transport,
-- Shopping, Bills, Health) via `seed_user_defaults()`. New signups now pick
-- their starter set during the onboarding flow (CategoriesSlide), so the seed
-- is shrunk to just the Cash account + a single mandatory "Others" category
-- (the catch-all that auto-categorization falls back to and that the
-- front-end gates from deletion).
--
-- This file is idempotent. Run it once in Supabase Dashboard → SQL Editor.

-- ── 1) Replace the seed function ──────────────────────────────────────────
-- Drops the 5 starter categories from auto-seeding. New users get only the
-- Cash account + Others. The onboarding picker handles the rest.

CREATE OR REPLACE FUNCTION seed_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO accounts (
    user_id, name, type, brand_colour, letter_avatar,
    balance, starting_balance, is_active, is_deletable, sort_order
  )
  VALUES (NEW.id, 'Cash', 'Cash', '#1C9E4B', 'P', 0, 0, TRUE, FALSE, 0);

  -- Mandatory catch-all category. is_default=TRUE keeps it locked from
  -- rename + delete in the front-end. Other categories all carry is_default=FALSE.
  INSERT INTO categories (
    user_id, name, emoji, tile_bg_colour, text_colour,
    is_active, is_default, sort_order
  )
  VALUES
    (NEW.id, 'Others', 'others', '#F2EFEC', '#5C5550', TRUE, TRUE, 999);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger itself is unchanged from restore_db.sql; recreate defensively
-- in case this file is run on a fresh DB.
DROP TRIGGER IF EXISTS trigger_seed_user_defaults ON users;
CREATE TRIGGER trigger_seed_user_defaults
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION seed_user_defaults();


-- ── 2) Backfill existing users ────────────────────────────────────────────
-- Insert "Others" for every user who doesn't have it yet. Idempotent — the
-- WHERE NOT EXISTS guards against re-running and against users who already
-- created their own "Others" manually.

INSERT INTO categories (
  user_id, name, emoji, tile_bg_colour, text_colour,
  is_active, is_default, sort_order
)
SELECT
  u.id, 'Others', 'others', '#F2EFEC', '#5C5550', TRUE, TRUE, 999
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.user_id = u.id
    AND LOWER(c.name) = 'others'
);


-- ── 3) Loosen `is_default` on the legacy 5 starters ───────────────────────
-- Existing users had Food/Transport/Shopping/Bills/Health created with
-- is_default=TRUE, which locked them from rename in the front-end. Under
-- the new model only "Others" is privileged, so flip these back to FALSE
-- for every existing user. New users skip this entirely (they only get
-- Others auto-created from now on).

UPDATE categories
SET is_default = FALSE
WHERE LOWER(name) IN ('food', 'transport', 'shopping', 'bills', 'health')
  AND is_default = TRUE;
