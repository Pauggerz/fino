CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  emoji VARCHAR(10),
  tile_bg_colour VARCHAR(20),    -- cat-tile background (from prototype)
  text_colour VARCHAR(20),
  budget_limit DECIMAL(12,2),    -- NULL = no limit, tracking only
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0
);
