-- Create InternalTokenList table for selected stocks
-- This table will be the source of truth for stocks used in the application

CREATE TABLE IF NOT EXISTS "internaltokenlist" (
  token VARCHAR(50) PRIMARY KEY,
  symbol VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  exch_seg VARCHAR(20),
  instrumenttype VARCHAR(50),
  ltp DECIMAL(20, 6),
  volume BIGINT,
  websocket_enabled BOOLEAN DEFAULT FALSE,
  tradeable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on symbol for faster lookups
CREATE INDEX IF NOT EXISTS idx_internal_symbol ON Internaltokenlist(symbol);

-- Create index on websocket_enabled for filtering active stocks
CREATE INDEX IF NOT EXISTS idx_internal_websocket ON Internaltokenlist(websocket_enabled);

COMMENT ON TABLE Internaltokenlist IS 'Stores selected stocks for the application';
