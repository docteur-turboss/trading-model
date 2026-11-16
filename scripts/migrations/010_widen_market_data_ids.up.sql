-- Migration: widen_market_data_ids
-- Up: id of the three market tables becomes BIGINT UNSIGNED (issue #1379)

-- Expand only: the upserts burn one AUTO_INCREMENT value per proposed row, even
-- when the row already exists, so a signed INT runs out. Existing ids and the
-- N-1 scraper (reads id as a number, supportBigNumbers) are unaffected.
ALTER TABLE `market_candles` MODIFY `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `market_trades` MODIFY `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `market_tickers` MODIFY `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
