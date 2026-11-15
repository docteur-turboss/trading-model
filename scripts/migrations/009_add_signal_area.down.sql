-- Migration: add_signal_area
-- Down: Remove the area subject. The area signals are DELETED (a row with only
-- `area` set would break the restored two-subject constraint); the asset and
-- sector rows are kept. Dump first: mysqldump <database> signals

DELETE FROM `signals` WHERE `area` IS NOT NULL;
ALTER TABLE `signals` DROP CHECK `chk_signals_one_subject`;
ALTER TABLE `signals` ADD CONSTRAINT `chk_signals_one_subject` CHECK ((`asset_id` IS NULL) <> (`sector` IS NULL));
ALTER TABLE `signals` DROP INDEX `idx_signals_area_observed`;
ALTER TABLE `signals` DROP COLUMN `area`;
