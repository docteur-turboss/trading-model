-- Migration: add_signals_observed_index
-- Down: Remove the index; the retention purge goes back to scanning `signals`.

ALTER TABLE `signals` DROP INDEX `idx_signals_observed`, ALGORITHM=INPLACE, LOCK=NONE;
