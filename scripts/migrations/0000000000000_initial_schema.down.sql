-- Migration: initial_schema
-- Down: Removes all market data tables

DROP TABLE IF EXISTS `market_candles`;
DROP TABLE IF EXISTS `market_trades`;
DROP TABLE IF EXISTS `market_tickers`;
