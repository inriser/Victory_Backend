-- Migration: Populate Reference Data
-- Description: Inserts standard data into Exchanges and ScriptTypes tables

-- 1. Populate Exchanges
INSERT INTO Exchanges (exchange_code, exchange_name) VALUES 
('NSE', 'National Stock Exchange'),
('BSE', 'Bombay Stock Exchange'),
('NFO', 'NSE Futures & Options'),
('MCX', 'Multi Commodity Exchange'),
('CDS', 'Currency Derivatives Segment')
ON CONFLICT (exchange_code) DO NOTHING;

-- 2. Populate ScriptTypes
INSERT INTO ScriptTypes (type_code, type_name, description) VALUES 
('EQ', 'Equity', 'Regular equity shares'),
('FUTSTK', 'Stock Futures', 'Futures contract on individual stocks'),
('OPTSTK', 'Stock Options', 'Options contract on individual stocks'),
('FUTIDX', 'Index Futures', 'Futures contract on indices (e.g. NIFTY)'),
('OPTIDX', 'Index Options', 'Options contract on indices'),
('AMXIDX', 'Index', 'Market Indices'),
('', 'Unknown', 'Undefined instrument type')
ON CONFLICT (type_code) DO NOTHING;
