-- Migration: widen_market_data_ids
-- Down: Back to INT. Fails (strict mode, "Out of range value") if a table holds
-- an id above 2147483647: nothing is truncated, the table is left untouched.

ALTER TABLE `market_candles` MODIFY `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `market_trades` MODIFY `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `market_tickers` MODIFY `id` INT NOT NULL AUTO_INCREMENT;
