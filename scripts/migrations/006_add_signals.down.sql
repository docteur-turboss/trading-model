-- Migration: add_signals
-- Down: Drop the signals. Their history is lost: only SEC EDGAR gives it back;
-- NWS (latest observation), ECB (last 5) and Wikimedia (8 days) do not.
-- Dump the table first: mysqldump <database> signals

DROP TABLE IF EXISTS `signals`;
