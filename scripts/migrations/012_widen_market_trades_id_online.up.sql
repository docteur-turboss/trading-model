-- Migration: widen_market_trades_id_online
-- Up: market_trades.id INT -> BIGINT UNSIGNED (every upsert burns an AUTO_INCREMENT value, issue #2017)
-- without blocking the collector (issue #2377). Replaces 011, whose ALTER ... MODIFY (ALGORITHM=COPY)
-- blocked every trade write, and with it the whole scrape cycle, for the copy of the table.

-- An empty BIGINT copy takes the name in one RENAME (a few ms of metadata lock), then the
-- old rows move over in small batches while the collector writes to the new table.
-- Also runs on a table 011 already widened: same swap, no row lost. N-1 reads and writes
-- the same columns; `id` is only a tie-break (ADR-0054), not a key.
CREATE TABLE IF NOT EXISTS `market_trades_new` LIKE `market_trades`;

ALTER TABLE `market_trades_new` MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;

-- Starts the new AUTO_INCREMENT 1e6 above the old ids, so the ids of the collector rows never
-- fall among the old ones the batches copy. The batch copying this trade gives it back its id.
INSERT IGNORE INTO `market_trades_new` (`id`, `symbol`, `market`, `source`, `trade_id`, `price`, `quantity`, `side`, `timestamp`)
    SELECT `id` + 1000000, `symbol`, `market`, `source`, `trade_id`, `price`, `quantity`, `side`, `timestamp`
    FROM `market_trades` ORDER BY `id` DESC LIMIT 1;

RENAME TABLE `market_trades` TO `market_trades_old`, `market_trades_new` TO `market_trades`;

-- Next 20 000 old rows above the highest old id already copied, one short transaction each:
-- a trade the collector wrote again since the swap keeps its old id.
-- repeat until no row changes
INSERT INTO `market_trades` (`id`, `symbol`, `market`, `source`, `trade_id`, `price`, `quantity`, `side`, `timestamp`)
    SELECT * FROM (
        SELECT `id`, `symbol`, `market`, `source`, `trade_id`, `price`, `quantity`, `side`, `timestamp`
        FROM `market_trades_old`
        WHERE `id` > (
            SELECT COALESCE(MAX(`t`.`id`), 0) FROM `market_trades` AS `t`
            WHERE `t`.`id` <= (SELECT MAX(`id`) FROM `market_trades_old`)
        )
        ORDER BY `id` LIMIT 20000
    ) AS `o`
    ON DUPLICATE KEY UPDATE `id` = LEAST(`market_trades`.`id`, `o`.`id`);

DROP TABLE IF EXISTS `market_trades_old`;
