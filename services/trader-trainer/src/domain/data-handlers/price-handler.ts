import type { PriceSnapshotData } from "../market-data-types";
import { type DataHandler, isAfterLast, pushWithMaxSize } from "./data-handler";
import { DataType } from "./data-types";

/** Price tickers, stamped at reception (Binance sends no time with them). */
export const priceHandler: DataHandler<PriceSnapshotData> = {
	dataType: DataType.Price,
	createState() {
		return { prices: [] };
	},
	createNorms() {
		return {};
	},
	updateNorms() {
		// A price ticker has no normaliser: the feature uses the close one.
	},
	isNew(state, snapshot) {
		return isAfterLast(state.prices, snapshot, "timestamp");
	},
	mutateState({ data, state, maxSize }) {
		if (isAfterLast(state.prices, data, "timestamp")) {
			state.prices = pushWithMaxSize(state.prices, data, maxSize);
		}
	},
	estimateMemoryBytes(state) {
		return state.prices.length * 48;
	},
	serializeNorms() {
		return {};
	},
};
