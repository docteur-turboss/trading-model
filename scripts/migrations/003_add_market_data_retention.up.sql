-- Migration 003: Add market data retention purge event
-- Created: 2026-06
-- Purpose: Prevent unbounded accumulation of market data in MySQL.
-- Deletes candles, trades, and tickers older than 1827 days (5 years).
-- This aligns with MiFID II record-keeping requirements (Art. 72).

-- Idempotent: DROP IF EXISTS before CREATE
DROP EVENT IF EXISTS purge_old_market_data;

CREATE EVENT purge_old_market_data
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP + INTERVAL 1 HOUR
ON COMPLETION PRESERVE
ENABLE
COMMENT 'Daily purge of market data older than 5 years (MiFID II retention)'
DO
BEGIN
  DECLARE cutoff DATETIME;
  SET cutoff = DATE_SUB(NOW(), INTERVAL 1827 DAY);

  DELETE FROM market_candles WHERE close_timestamp < cutoff;
  DELETE FROM market_trades   WHERE timestamp < cutoff;
  DELETE FROM market_tickers  WHERE close_time < cutoff;
END;
