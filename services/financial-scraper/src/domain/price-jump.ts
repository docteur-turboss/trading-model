import type { CandleData } from "./market-data.types";

/**
 * Largest |ln(close / reference close)| accepted for one candle: ln 2 = a
 * x2 / x0.5 move, far above any real one-candle move on listed pairs
 * (a -40 % crash is 0.51) and far below a x10 tick (2.3).
 */
const MAX_LOG_PRICE_JUMP = Math.LN2;

/**
 * Splits a series (oldest first) into the candles to keep and those whose
 * close jumps beyond `MAX_LOG_PRICE_JUMP` from the last kept close.
 * The first candle is compared to the series median, so an aberrant first tick
 * cannot reject its neighbours. Fewer than two candles: nothing is rejected.
 */
export function dropPriceJumps(candles: CandleData[]): {
	kept: CandleData[];
	dropped: CandleData[];
} {
	if (candles.length < 2) {
		return { kept: candles, dropped: [] };
	}
	const sorted = candles
		.map((candle) => candle.close)
		.sort((low, high) => low - high);
	let reference: number = sorted[Math.floor(sorted.length / 2)];
	const kept: CandleData[] = [];
	const dropped: CandleData[] = [];
	for (const candle of candles) {
		if (Math.abs(Math.log(candle.close / reference)) > MAX_LOG_PRICE_JUMP) {
			dropped.push(candle);
		} else {
			kept.push(candle);
			reference = candle.close;
		}
	}
	return { kept, dropped };
}
