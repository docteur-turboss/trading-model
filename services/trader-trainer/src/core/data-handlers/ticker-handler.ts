import type { TickerData } from "@trading-model/common/config/event.types";
import { NormalizationStats } from "../normalization-stats";
import type { DataHandler } from "./data-handler";
import { DataType } from "./data-types";

export const tickerHandler: DataHandler<TickerData> = {
	dataType: DataType.Ticker,
	createState() {
		return { ticker24h: undefined };
	},
	createNorms() {
		return {
			ticker: { volume: new NormalizationStats() },
		};
	},
	updateNorms(state, ticker) {
		state.norm.ticker.volume.update(ticker.volume);
	},
	mutateState({ data, state }) {
		state.ticker24h = data;
	},
	estimateMemoryBytes(state) {
		return state.ticker24h ? 256 : 0;
	},
	serializeNorms(state) {
		return {
			ticker: {
				volume: state.norm.ticker.volume.toJSON(),
			},
		};
	},
};
