-- Migration: add_signals
-- Down: Drop the signals (the next collections fill the table again from now on)

DROP TABLE IF EXISTS `signals`;
