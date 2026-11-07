-- Migration: make_timestamp_indexes_visible
-- Up: Make the three `timestamp` indexes visible (issue #555)
--
-- They were created INVISIBLE in the initial schema, and the primary keys start
-- with `symbol`: every `WHERE timestamp ...` query (the /timestamp/:timestamp
-- routes, selectTradesBy.timestamp) scanned the whole table. Metadata-only
-- change (no rebuild, expand-only). Cost: each insert/upsert already maintained
-- these indexes; making them visible adds no write cost beyond what was paid.

ALTER TABLE `market_candles` ALTER INDEX `idx_candles_timestamp` VISIBLE;
ALTER TABLE `market_trades` ALTER INDEX `idx_trades_timestamp` VISIBLE;
ALTER TABLE `market_tickers` ALTER INDEX `idx_tickers_timestamp` VISIBLE;
