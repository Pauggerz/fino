-- Auto-create public.users row when a new Supabase auth user is created.
-- This fires on signup (before email confirmation) so the profile + defaults
-- are ready the moment the user first signs in.
--
-- Run this once in: Supabase Dashboard → SQL Editor → New Query

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, currency, auth_mode, total_budget)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)  -- fallback: use part before @
    ),
    'PHP',
    'cloud',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  -- seed_user_defaults trigger on public.users fires automatically on INSERT above
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
