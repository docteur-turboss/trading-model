-- Migration: add_paged_read_indexes
-- Up: Composite indexes for the paged market data reads and the signals retention

-- Expand only. The paged reads are `WHERE <filter> ORDER BY timestamp, id LIMIT n`:
-- (symbol|source, timestamp, id) serves the filter and the order without filesort;
-- (timestamp, id) serves the /timestamp routes. `market` is not filtered by these
-- routes, so it is not part of them. `signals (observed_at)` serves the batched
-- retention DELETE. The idx_*_symbol indexes this makes redundant stay until a
-- later release (contract).
ALTER TABLE `market_candles` ADD INDEX `idx_candles_symbol_ts` (`symbol`, `timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_candles` ADD INDEX `idx_candles_source_ts` (`source`, `timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_candles` ADD INDEX `idx_candles_ts_id` (`timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_trades` ADD INDEX `idx_trades_symbol_ts` (`symbol`, `timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_trades` ADD INDEX `idx_trades_source_ts` (`source`, `timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_trades` ADD INDEX `idx_trades_ts_id` (`timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_tickers` ADD INDEX `idx_tickers_symbol_ts` (`symbol`, `timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_tickers` ADD INDEX `idx_tickers_source_ts` (`source`, `timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `market_tickers` ADD INDEX `idx_tickers_ts_id` (`timestamp`, `id`), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE `signals` ADD INDEX `idx_signals_observed_at` (`observed_at`), ALGORITHM=INPLACE, LOCK=NONE;
