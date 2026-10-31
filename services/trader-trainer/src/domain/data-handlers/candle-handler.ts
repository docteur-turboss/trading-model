import type { CandleData } from "@trading-model/contracts/market-data.types";
import { NormalizationStats } from "../normalization-stats";
import type { DataHandler } from "./data-handler";
import { pushWithMaxSize } from "./data-handler";
import { DataType } from "./data-types";

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
		return isAfterLastCandle(state.candles, candle);
	},
	mutateState({ data, state, maxSize }) {
		// The scraper re-sends candles it already published (overlapping fetch
		// windows, retries): keep the series strictly increasing in time, or the
		// same candle lands in both the training and the validation windows.
		if (isAfterLastCandle(state.candles, data)) {
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

function isAfterLastCandle(candles: CandleData[], candle: CandleData): boolean {
	const last = candles[candles.length - 1] as CandleData | undefined;
	return last === undefined || candle.timestamp > last.timestamp;
}
