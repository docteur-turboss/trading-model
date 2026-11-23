import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	createCandleNorms,
	isConsistentCandle,
	updateCandleNorms,
} from "@trading-model/model-runtime/features/feature-builder";
import type { DataHandler } from "./data-handler";
import { isAfterLast, pushWithMaxSize } from "./data-handler-utils";
import { DataType } from "./data-types";

export const candleHandler: DataHandler<CandleData> = {
	dataType: DataType.Candle,
	createState() {
		return { candles: [] };
	},
	createNorms() {
		return { candle: createCandleNorms() };
	},
	updateNorms(state, candle) {
		updateCandleNorms(state.norm.candle, candle);
	},
	isNew(state, candle) {
		return (
			isConsistentCandle(candle) &&
			isAfterLast(state.candles, candle, "timestamp")
		);
	},
	mutateState({ data, state, maxSize }) {
		if (!isConsistentCandle(data)) {
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
