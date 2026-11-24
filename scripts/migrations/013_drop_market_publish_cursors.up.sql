-- Migration: drop_market_publish_cursors
-- Up: release N-1 (v3.1.0) no longer reads or writes the table (issue #1737), ADR-0040 contract step

DROP TABLE IF EXISTS `market_publish_cursors`;
