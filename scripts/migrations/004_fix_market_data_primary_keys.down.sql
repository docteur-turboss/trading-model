-- Migration: fix_market_data_primary_keys
-- Down: Restore id in composite PKs

ALTER TABLE `market_candles`
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`id`, `symbol`, `market`, `interval_value`, `timestamp`, `source`),
    DROP INDEX `idx_candles_id`;

ALTER TABLE `market_tickers`
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`id`, `symbol`, `market`, `timestamp`, `source`),
    DROP INDEX `idx_tickers_id`;
