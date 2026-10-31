-- Migration: add_market_publish_cursors
-- Up: Per candle series, how far financial-scraper has published to the bus

-- The scraper persists candles before publishing them. The candles of a
-- series from `published_until` on are persisted but not yet on the bus: each
-- cycle publishes the next ones from market_candles, so a message-manager
-- outage or a scraper restart loses none of them.
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
