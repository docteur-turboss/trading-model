-- Migration: add_signals
-- Up: Signals of every dimension collected from the source registry (ADR-0036)

-- One row per observation about an asset (`asset_id`) or a whole sector
-- (`sector`, e.g. weather for agriculture): exactly one of the two is set.
-- `id` is the sha256 of source, subject, metric and observation key, so a
-- replayed collection inserts nothing twice. `observed_at` is never earlier
-- than the value was public, `ingested_at` is when the scraper fetched it;
-- both are kept with `confidence_score` for the consumers to weigh.
-- `payload` is the canonical payload of the dimension (a measure: metric,
-- value, unit, plus what reads it in its dimension: period, filing...).
CREATE TABLE IF NOT EXISTS `signals` (
    `id`               CHAR(64) NOT NULL,
    `schema_version`   SMALLINT UNSIGNED NOT NULL,
    `source_id`        VARCHAR(64) NOT NULL,
    `dimension`        VARCHAR(32) NOT NULL,
    `asset_id`         VARCHAR(32) NULL,
    `sector`           VARCHAR(32) NULL,
    `observed_at`      DATETIME(3) NOT NULL,
    `ingested_at`      DATETIME(3) NOT NULL,
    `confidence_score` DOUBLE NOT NULL,
    `payload`          JSON NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_signals_asset_observed` (`asset_id`, `observed_at`),
    INDEX `idx_signals_sector_observed` (`sector`, `observed_at`),
    CONSTRAINT `chk_signals_one_subject` CHECK ((`asset_id` IS NULL) <> (`sector` IS NULL))
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
