-- Migration: add_market_publish_cursors
-- Down: Drop the publish cursors (the scraper starts again from its next candle)

DROP TABLE IF EXISTS `market_publish_cursors`;
