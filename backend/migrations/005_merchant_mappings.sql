CREATE TABLE merchant_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  raw_ocr_string VARCHAR(200),
  display_name VARCHAR(200),
  category VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
