CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100),
  currency VARCHAR(10) DEFAULT 'PHP',
  auth_mode VARCHAR(20) DEFAULT 'local',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
