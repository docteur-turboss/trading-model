-- Migration: initial_schema
-- Up: Creates the initial market data tables
-- This is the baseline migration. Run against an empty database.

CREATE TABLE IF NOT EXISTS `market_candles` (
    `id`               INT NOT NULL AUTO_INCREMENT,
    `symbol`           VARCHAR(32) NOT NULL,
    `market`           VARCHAR(16) NOT NULL,
    `source`           VARCHAR(32) NOT NULL,
    `interval_value`   VARCHAR(16) NOT NULL,
    `open`             DECIMAL(20,10) NOT NULL,
    `high`             DECIMAL(20,10) NOT NULL,
    `low`              DECIMAL(20,10) NOT NULL,
    `close`            DECIMAL(20,10) NOT NULL,
    `volume`           DECIMAL(30,10) NOT NULL,
    `trades`           INT NULL,
    `timestamp`        DATETIME(3) NOT NULL,
    `close_timestamp`  DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`, `symbol`, `market`, `interval_value`, `timestamp`, `source`),
    INDEX `idx_candles_timestamp` (`timestamp` ASC) INVISIBLE,
    INDEX `idx_candles_symbol` (`symbol` ASC) VISIBLE
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `market_trades` (
    `id`          INT NOT NULL AUTO_INCREMENT,
    `symbol`      VARCHAR(32) NOT NULL,
    `market`      VARCHAR(16) NOT NULL,
    `source`      VARCHAR(32) NOT NULL,
    `trade_id`    BIGINT NOT NULL,
    `price`       DECIMAL(20,10) NOT NULL,
    `quantity`    DECIMAL(30,10) NOT NULL,
    `side`        ENUM('buy', 'sell') NOT NULL,
    `timestamp`   DATETIME(3) NOT NULL,
    PRIMARY KEY (`symbol`, `market`, `source`, `trade_id`, `timestamp`),
    INDEX `idx_trades_timestamp` (`timestamp` ASC) INVISIBLE,
    INDEX `idx_trades_symbol` (`symbol` ASC) VISIBLE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `market_tickers` (
    `id`               INT NOT NULL AUTO_INCREMENT,
    `symbol`           VARCHAR(32) NOT NULL,
    `market`           VARCHAR(16) NOT NULL,
    `source`           VARCHAR(32) NOT NULL,
    `open`             DECIMAL(20,10) NOT NULL,
    `high`             DECIMAL(20,10) NOT NULL,
    `low`              DECIMAL(20,10) NOT NULL,
    `last`             DECIMAL(20,10) NOT NULL,
    `volume`           DECIMAL(30,10) NOT NULL,
    `timestamp`        DATETIME(3) NOT NULL,
    `close_time`       DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`, `symbol`, `market`, `timestamp`, `source`),
    INDEX `idx_tickers_timestamp` (`timestamp` ASC) INVISIBLE,
    INDEX `idx_tickers_symbol` (`symbol` ASC) VISIBLE
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
