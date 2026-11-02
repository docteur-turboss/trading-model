-- Migration: fix_market_data_primary_keys
-- Up: Key market_candles and market_tickers on their business key instead of id

-- With `id` in the old PK the upserts never matched, so every scrape inserted
-- its rows again: keep only the last insert of each business key (the most
-- recent values, e.g. the candle once closed), or ADD PRIMARY KEY fails on
-- the first duplicate.
DELETE `older` FROM `market_candles` AS `older`
    JOIN `market_candles` AS `newer`
        ON `newer`.`symbol` = `older`.`symbol`
        AND `newer`.`market` = `older`.`market`
        AND `newer`.`interval_value` = `older`.`interval_value`
        AND `newer`.`timestamp` = `older`.`timestamp`
        AND `newer`.`source` = `older`.`source`
        AND `newer`.`id` > `older`.`id`;

DELETE `older` FROM `market_tickers` AS `older`
    JOIN `market_tickers` AS `newer`
        ON `newer`.`symbol` = `older`.`symbol`
        AND `newer`.`market` = `older`.`market`
        AND `newer`.`timestamp` = `older`.`timestamp`
        AND `newer`.`source` = `older`.`source`
        AND `newer`.`id` > `older`.`id`;

-- `id` stays AUTO_INCREMENT, which MySQL only allows on an indexed column, so
-- the old PK is swapped for the business key and `id` gets its own index in
-- one statement. The business-key PK is the uniqueness constraint the upserts
-- (INSERT ... ON DUPLICATE KEY UPDATE) rely on.
ALTER TABLE `market_candles`
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`symbol`, `market`, `interval_value`, `timestamp`, `source`),
    ADD INDEX `idx_candles_id` (`id`);

ALTER TABLE `market_tickers`
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`symbol`, `market`, `timestamp`, `source`),
    ADD INDEX `idx_tickers_id` (`id`);
