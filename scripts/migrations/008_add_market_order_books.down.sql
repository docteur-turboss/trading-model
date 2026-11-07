-- Migration: add_market_order_books
-- Down: Drop the order book snapshots. Their history is lost: Binance only
-- gives the current depth back. Dump the table first:
-- mysqldump <database> market_order_books

DROP TABLE IF EXISTS `market_order_books`;
