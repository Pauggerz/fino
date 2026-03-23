-- Migration: 009_seed_defaults
-- Creates a trigger that auto-seeds default account + categories
-- on every new user insert into the users table.
-- Run: psql $RAILWAY_DB_URL -f backend/migrations/009_seed_defaults.sql

CREATE OR REPLACE FUNCTION seed_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO accounts (user_id, name, type, brand_colour, letter_avatar, balance, starting_balance, is_active, is_deletable, sort_order)
  VALUES (NEW.id, 'Cash', 'Cash', '#1C9E4B', 'P', 0, 0, TRUE, FALSE, 0);

  INSERT INTO categories (user_id, name, emoji, tile_bg_colour, text_colour, is_active, is_default, sort_order)
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
