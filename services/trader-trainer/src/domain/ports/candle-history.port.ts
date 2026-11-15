import type { CandleData } from "@trading-model/contracts/market-data.types";
import type { TradingSymbol } from "../market-data-types";

/** Stored candles of a symbol: the source of the training dataset. */
export interface CandleHistoryPort {
	/**
	 * The newest `size` one-minute candles of `symbol` closed at or before
	 * `at` (epoch ms), oldest first, no duplicate: nothing after `at` is read
	 * (point-in-time, ADR-0030).
	 */
	loadWindow(
		symbol: TradingSymbol,
		at: number,
		size: number
	): Promise<CandleData[]>;
}
