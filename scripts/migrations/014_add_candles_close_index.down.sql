-- Migration: add_candles_close_index
-- Down: Remove the index; the latest-candle read goes back to scanning the symbol.

ALTER TABLE `market_candles` DROP INDEX `idx_candles_symbol_close`, ALGORITHM=INPLACE, LOCK=NONE;
