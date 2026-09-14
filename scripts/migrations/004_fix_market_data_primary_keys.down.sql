-- Migration: fix_market_data_primary_keys
-- Down: Restore id in composite PKs

-- market_candles: drop unique index and PK, restore original composite PK
ALTER TABLE `market_candles` DROP INDEX `uq_candles_business_key`;
ALTER TABLE `market_candles` DROP PRIMARY KEY;
ALTER TABLE `market_candles` ADD PRIMARY KEY (`id`, `symbol`, `market`, `interval_value`, `timestamp`, `source`);

-- market_tickers: drop unique index and PK, restore original composite PK
ALTER TABLE `market_tickers` DROP INDEX `uq_tickers_business_key`;
ALTER TABLE `market_tickers` DROP PRIMARY KEY;
ALTER TABLE `market_tickers` ADD PRIMARY KEY (`id`, `symbol`, `market`, `timestamp`, `source`);
