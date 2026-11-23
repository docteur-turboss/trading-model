-- Migration: widen_market_trades_id
-- Up: market_trades.id INT -> BIGINT UNSIGNED (every upsert burns an AUTO_INCREMENT value, issue #2017)

-- Type change is ALGORITHM=COPY in MySQL 8.4: LOCK=SHARED keeps reads, blocks writes
-- for the copy. Only market_trades (own short retention) is widened, not market_candles
-- (9.6 M rows on staging blocked the Job in #1450). N-1 reads/writes the same column name.
ALTER TABLE `market_trades` MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ALGORITHM=COPY, LOCK=SHARED;
