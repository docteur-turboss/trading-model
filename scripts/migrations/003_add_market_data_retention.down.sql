-- Migration: 003_add_market_data_retention
-- Down: Remove the market data retention purge event
DROP EVENT IF EXISTS purge_old_market_data;