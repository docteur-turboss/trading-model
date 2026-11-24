-- Migration: add_candles_close_index
-- Up: GET /v2/candles/latest reads the newest closed candle of a symbol by `close_timestamp`

-- Expand only: one index, built in place without blocking the collector inserts.
ALTER TABLE `market_candles` ADD INDEX `idx_candles_symbol_close` (`symbol`, `close_timestamp`), ALGORITHM=INPLACE, LOCK=NONE;
