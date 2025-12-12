-- Migration: Create Indices Control Table
-- Purpose: Control which stocks belong to which indices, sectors, and themes
-- This replaces hardcoded index constituents with a database-driven approach

CREATE TABLE IF NOT EXISTS "IndicesControl" (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- 'index', 'sector', 'theme'
    group_name VARCHAR(100) NOT NULL, -- e.g., 'Sensex', 'NIFTY', 'Information Technology', 'ESG'
    exchange VARCHAR(10) NOT NULL, -- 'NSE', 'BSE'
    symbol VARCHAR(50) NOT NULL, -- Stock symbol (e.g., 'RELIANCE')
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fast lookups
CREATE INDEX idx_indices_control_type_group ON "IndicesControl"(type, group_name);
CREATE INDEX idx_indices_control_symbol ON "IndicesControl"(symbol);
CREATE INDEX idx_indices_control_exchange ON "IndicesControl"(exchange);
CREATE INDEX idx_indices_control_active ON "IndicesControl"(is_active);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX idx_indices_control_unique ON "IndicesControl"(type, group_name, exchange, symbol);

-- Add comment
COMMENT ON TABLE "IndicesControl" IS 'Control table for managing index, sector, and theme constituents';
