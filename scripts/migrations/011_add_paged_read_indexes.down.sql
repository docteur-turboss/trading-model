-- Migration: add_paged_read_indexes
-- Down: Drop the composite indexes
ALTER TABLE `market_candles` DROP INDEX `idx_candles_symbol_ts`;
ALTER TABLE `market_candles` DROP INDEX `idx_candles_source_ts`;
ALTER TABLE `market_candles` DROP INDEX `idx_candles_ts_id`;
ALTER TABLE `market_trades` DROP INDEX `idx_trades_symbol_ts`;
ALTER TABLE `market_trades` DROP INDEX `idx_trades_source_ts`;
ALTER TABLE `market_trades` DROP INDEX `idx_trades_ts_id`;
ALTER TABLE `market_tickers` DROP INDEX `idx_tickers_symbol_ts`;
ALTER TABLE `market_tickers` DROP INDEX `idx_tickers_source_ts`;
ALTER TABLE `market_tickers` DROP INDEX `idx_tickers_ts_id`;
ALTER TABLE `signals` DROP INDEX `idx_signals_observed_at`;
