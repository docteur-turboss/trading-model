import type { CandleData } from "@trading-model/contracts/market-data.types";
import { DAILY_BAR_ISSUES_TOTAL } from "../../config/metrics";
import { NormalizationStats } from "../normalization-stats";
import type { DataHandler } from "./data-handler";
import { isAfterLast, pushWithMaxSize } from "./data-handler-utils";
import { DataType } from "./data-types";

/** `low`/`high` must bound `open` and `close`: features divide by `high - low`. */
function isConsistent(candle: CandleData): boolean {
	return (
		candle.low <= Math.min(candle.open, candle.close) &&
		Math.max(candle.open, candle.close) <= candle.high
	);
}

export const candleHandler: DataHandler<CandleData> = {
	dataType: DataType.Candle,
	createState() {
		return { candles: [] };
	},
	createNorms() {
		return {
			candle: {
				close: new NormalizationStats(),
				volume: new NormalizationStats(),
				open: new NormalizationStats(),
				high: new NormalizationStats(),
				low: new NormalizationStats(),
			},
		};
	},
	updateNorms(state, candle) {
		state.norm.candle.close.update(candle.close);
		state.norm.candle.volume.update(candle.volume);
		state.norm.candle.open.update(candle.open);
		state.norm.candle.high.update(candle.high);
		state.norm.candle.low.update(candle.low);
	},
	isNew(state, candle) {
		return (
			isConsistent(candle) && isAfterLast(state.candles, candle, "timestamp")
		);
	},
	mutateState({ symbol, data, state, maxSize }) {
		if (!isConsistent(data)) {
			DAILY_BAR_ISSUES_TOTAL.inc({ symbol, issue: "ohlc_inconsistent" });
			return;
		}
		// The scraper re-sends candles it already published (overlapping fetch
		// windows, retries): keep the series strictly increasing in time, or the
		// same candle lands in both the training and the validation windows.
		if (isAfterLast(state.candles, data, "timestamp")) {
			state.candles = pushWithMaxSize(state.candles, data, maxSize);
		} else if (
			state.candles[state.candles.length - 1]?.timestamp === data.timestamp
		) {
			// A later version of the last candle (it was still open) supersedes it.
			state.candles[state.candles.length - 1] = data;
		}
	},
	estimateMemoryBytes(state) {
		return state.candles.length * 200;
	},
	serializeNorms(state) {
		return {
			candle: {
				close: state.norm.candle.close.toJSON(),
				volume: state.norm.candle.volume.toJSON(),
				open: state.norm.candle.open.toJSON(),
				high: state.norm.candle.high.toJSON(),
				low: state.norm.candle.low.toJSON(),
			},
		};
	},
};
