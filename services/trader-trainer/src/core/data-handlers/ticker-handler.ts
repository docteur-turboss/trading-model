import type { TickerData } from "@trading-model/common/config/event.types";
import type { DataHandler } from "./data-handler";
import { DataType } from "./data-types";

export const tickerHandler: DataHandler<TickerData> = {
	dataType: DataType.Ticker,
	updateNorms(state, ticker) {
		state.norm.tickerVolume.update(ticker.volume);
	},
	mutateState(_symbol, data, state, _maxSize) {
		state.ticker24h = data;
	},
	serializeNorms(state) {
		return {
			tickerVolumeNorm: state.norm.tickerVolume.toJSON(),
		};
	},
};
