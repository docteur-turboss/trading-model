import type { CandleData } from "@trading-model/common/config/event.types";
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
	mutateState({ data, state, maxSize }) {
		state.candles = pushWithMaxSize(state.candles, data, maxSize);
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
