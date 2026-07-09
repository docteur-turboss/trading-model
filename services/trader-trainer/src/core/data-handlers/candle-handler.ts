import type { CandleData } from "@trading-model/common/config/event.types";
import type { DataHandler } from "./data-handler";
import { DataType } from "./data-types";

export const candleHandler: DataHandler<CandleData> = {
	dataType: DataType.Candle,
	updateNorms(state, candle) {
		state.norm.candleClose.update(candle.close);
		state.norm.candleVolume.update(candle.volume);
		state.norm.candleOpen.update(candle.open);
		state.norm.candleHigh.update(candle.high);
		state.norm.candleLow.update(candle.low);
	},
	mutateState(_symbol, data, state, maxSize) {
		state.candles.push(data);
		if (maxSize !== undefined && state.candles.length > maxSize) {
			state.candles = state.candles.slice(-maxSize);
		}
	},
	serializeNorms(state) {
		return {
			closeNorm: state.norm.candleClose.toJSON(),
			volumeNorm: state.norm.candleVolume.toJSON(),
			openNorm: state.norm.candleOpen.toJSON(),
			highNorm: state.norm.candleHigh.toJSON(),
			lowNorm: state.norm.candleLow.toJSON(),
		};
	},
};
