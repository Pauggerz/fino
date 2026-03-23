CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  brand_colour VARCHAR(20),   -- hex from theme.ts accountCash/GCash/BDO/Maya
  letter_avatar VARCHAR(5),   -- ₱ for Cash, G for GCash, B for BDO, M for Maya
  balance DECIMAL(12,2) DEFAULT 0,
  starting_balance DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_deletable BOOLEAN DEFAULT TRUE,  -- Cash = FALSE always
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
