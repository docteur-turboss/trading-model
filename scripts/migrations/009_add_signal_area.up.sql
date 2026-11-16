-- Migration: add_signal_area
-- Up: A signal may be about an economic area (ADR-0036 amended)

-- Expand only: `area` is nullable, so existing asset and sector rows stay valid
-- and the N-1 scraper (which never sets it) still writes valid rows. The one
-- subject rule becomes "exactly one of asset_id, sector, area".
ALTER TABLE `signals` ADD COLUMN `area` VARCHAR(32) NULL AFTER `sector`;
ALTER TABLE `signals` ADD INDEX `idx_signals_area_observed` (`area`, `observed_at`);
ALTER TABLE `signals` DROP CHECK `chk_signals_one_subject`;
ALTER TABLE `signals` ADD CONSTRAINT `chk_signals_one_subject` CHECK ((`asset_id` IS NOT NULL) + (`sector` IS NOT NULL) + (`area` IS NOT NULL) = 1);
