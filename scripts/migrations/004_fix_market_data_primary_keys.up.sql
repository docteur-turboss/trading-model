-- Migration: fix_market_data_primary_keys
-- Up: Remove id from composite PKs, add UNIQUE constraints on business keys

-- market_candles: drop composite PK, re-add without id, add unique index
ALTER TABLE `market_candles` DROP PRIMARY KEY;
ALTER TABLE `market_candles` ADD PRIMARY KEY (`symbol`, `market`, `interval_value`, `timestamp`, `source`);
ALTER TABLE `market_candles` ADD UNIQUE INDEX `uq_candles_business_key` (`symbol`, `market`, `interval_value`, `timestamp`, `source`);

-- market_tickers: drop composite PK, re-add without id, add unique index
ALTER TABLE `market_tickers` DROP PRIMARY KEY;
ALTER TABLE `market_tickers` ADD PRIMARY KEY (`symbol`, `market`, `timestamp`, `source`);
ALTER TABLE `market_tickers` ADD UNIQUE INDEX `uq_tickers_business_key` (`symbol`, `market`, `timestamp`, `source`);
