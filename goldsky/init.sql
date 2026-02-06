-- Goldsky-managed schema (tables created automatically by pipeline sinks)
CREATE SCHEMA IF NOT EXISTS indexer;

-- App-managed tables
CREATE TABLE IF NOT EXISTS market_metadata (
  market_id TEXT PRIMARY KEY,
  image_url TEXT,
  description TEXT,
  category TEXT,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_stats (
  market_id TEXT PRIMARY KEY,
  order_count INT DEFAULT 0,
  total_volume TEXT DEFAULT '0',
  unique_traders INT DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id SERIAL PRIMARY KEY,
  market_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  yes_price INT NOT NULL,  -- 0-10000 scale (50% = 5000)
  no_price INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_market_time
  ON price_snapshots (market_id, timestamp);

-- Seed flat 50/50 prices for existing test markets
INSERT INTO price_snapshots (market_id, timestamp, yes_price, no_price)
SELECT
  m.market_id,
  now() - (interval '1 hour' * gs),
  5000,
  5000
FROM (
  VALUES
    ('0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834'),
    ('0xd84f7e3380154a1c5291b516486f371585cfccb9ffc155cfbdd5e6b5c0b4172d')
) AS m(market_id)
CROSS JOIN generate_series(0, 23) AS gs
ON CONFLICT DO NOTHING;

-- Seed metadata for test markets
INSERT INTO market_metadata (market_id, description, category, featured)
VALUES
  ('0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834', 'Will Bitcoin reach $100,000 before the resolution date?', 'crypto', true),
  ('0xd84f7e3380154a1c5291b516486f371585cfccb9ffc155cfbdd5e6b5c0b4172d', NULL, 'other', false)
ON CONFLICT (market_id) DO NOTHING;
