-- Migration: add_signal_documents
-- Up: documents behind text signals (ADR-0084), expand only. No body, no party or author name.
-- Purged after 90 days by scripts/retention-mysql.sh (ADR-0051).

CREATE TABLE IF NOT EXISTS `signal_documents` (
    `id`                 CHAR(64)     NOT NULL COMMENT 'sha256 of source and feed item id or URL',
    `source_id`          VARCHAR(64)  NOT NULL,
    `url`                VARCHAR(2048) NOT NULL,
    `title`              VARCHAR(512) NOT NULL,
    `published_at`       DATETIME(3)  NULL,
    `first_seen_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `content_hash`       CHAR(64)     NOT NULL,
    `language`           VARCHAR(16)  NULL,
    `enrichment_tool`    VARCHAR(64)  NULL,
    `enrichment_version` VARCHAR(32)  NULL,
    `enrichment_result`  JSON         NULL,
    PRIMARY KEY (`id`),
    KEY `idx_signal_documents_first_seen` (`first_seen_at`)
) ENGINE = InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
