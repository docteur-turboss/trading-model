-- Migration: add_market_order_books
-- Up: Order book snapshots kept in MySQL for historical replay (ADR-0053)

-- One row per depth snapshot of a symbol. `bids` and `asks` are JSON arrays of
-- `[price, quantity]` pairs, best level first, as Binance sends them: a
-- snapshot is read whole, never level by level. Replaying a collection
-- overwrites the same row (primary key). Purged by the db-retention job
-- (ADR-0051) on `timestamp`, like the other market data tables.
CREATE TABLE IF NOT EXISTS `market_order_books` (
    `symbol`     VARCHAR(32) NOT NULL,
    `market`     VARCHAR(16) NOT NULL,
    `source`     VARCHAR(32) NOT NULL,
    `timestamp`  DATETIME(3) NOT NULL,
    `bids`       JSON NOT NULL,
    `asks`       JSON NOT NULL,
    PRIMARY KEY (`symbol`, `market`, `source`, `timestamp`),
    INDEX `idx_order_books_timestamp` (`timestamp` ASC)
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
