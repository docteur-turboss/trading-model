import type { TickerData } from "@trading-model/common/config/event.types";
import type { SymbolState } from "../market-data-types";
import { DataType } from "./data-types";
import type { DataHandler } from "./data-handler";

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
