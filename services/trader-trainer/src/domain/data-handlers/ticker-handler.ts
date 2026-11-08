import type { TickerData } from "@trading-model/contracts/market-data.types";
import { NormalizationStats } from "../normalization-stats";
import { type DataHandler, isAfterLast, pushWithMaxSize } from "./data-handler";
import { DataType } from "./data-types";

export const tickerHandler: DataHandler<TickerData> = {
	dataType: DataType.Ticker,
	createState() {
		return { tickers24h: [] };
	},
	createNorms() {
		return {
			ticker: { volume: new NormalizationStats() },
		};
	},
	updateNorms(state, ticker) {
		state.norm.ticker.volume.update(ticker.volume);
	},
	// A 24h ticker is known at its close; its timestamp is the window open.
	isNew(state, ticker) {
		return isAfterLast(state.tickers24h, ticker, "closeTimestamp");
	},
	mutateState({ data, state, maxSize }) {
		if (isAfterLast(state.tickers24h, data, "closeTimestamp")) {
			state.tickers24h = pushWithMaxSize(state.tickers24h, data, maxSize);
		}
	},
	estimateMemoryBytes(state) {
		return state.tickers24h.length * 256;
	},
	serializeNorms(state) {
		return {
			ticker: {
				volume: state.norm.ticker.volume.toJSON(),
			},
		};
	},
};
