-- Migration: widen_market_trades_id
-- Down: back to INT. Fails (strict mode) if an id is already above 2147483647.

ALTER TABLE `market_trades` MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT, ALGORITHM=COPY, LOCK=SHARED;
