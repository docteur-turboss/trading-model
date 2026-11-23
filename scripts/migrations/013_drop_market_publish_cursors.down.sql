-- Migration: drop_market_publish_cursors
-- Down: recreate the empty table as migration 005 made it

CREATE TABLE IF NOT EXISTS `market_publish_cursors` (
    `source`           VARCHAR(32) NOT NULL,
    `symbol`           VARCHAR(32) NOT NULL,
    `interval_value`   VARCHAR(16) NOT NULL,
    `market`           VARCHAR(16) NOT NULL,
    -- Open time of the next candle to publish.
    `published_until`  DATETIME(3) NOT NULL,
    `updated_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`source`, `symbol`, `interval_value`)
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
