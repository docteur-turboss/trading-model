-- Migration: make_timestamp_indexes_visible
-- Down: Hide the `timestamp` indexes again (as the initial schema left them)

ALTER TABLE `market_candles` ALTER INDEX `idx_candles_timestamp` INVISIBLE;
ALTER TABLE `market_trades` ALTER INDEX `idx_trades_timestamp` INVISIBLE;
ALTER TABLE `market_tickers` ALTER INDEX `idx_tickers_timestamp` INVISIBLE;
