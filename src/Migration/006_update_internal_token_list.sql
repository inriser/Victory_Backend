-- Migration: Add indexes and trigger for InternalTokenList
-- Purpose: Optimize LTP/Volume updates and auto-update timestamps

-- Add index on updated_at for performance monitoring
CREATE INDEX IF NOT EXISTS idx_internal_updated_at ON InternalTokenList(updated_at);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_internaltokenlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function before updates
DROP TRIGGER IF EXISTS trigger_update_internaltokenlist_timestamp ON InternalTokenList;
CREATE TRIGGER trigger_update_internaltokenlist_timestamp
BEFORE UPDATE ON InternalTokenList
FOR EACH ROW
EXECUTE FUNCTION update_internaltokenlist_timestamp();

-- Verify indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'internaltokenlist'
ORDER BY indexname;
