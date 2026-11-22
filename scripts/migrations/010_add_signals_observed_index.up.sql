-- Migration: add_signals_observed_index
-- Up: the retention purge (ADR-0051) reads `signals` by `observed_at` alone

-- Expand only: one index, built in place without blocking the collector inserts.
ALTER TABLE `signals` ADD INDEX `idx_signals_observed` (`observed_at`), ALGORITHM=INPLACE, LOCK=NONE;
