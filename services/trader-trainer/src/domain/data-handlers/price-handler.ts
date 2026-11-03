import type { PriceSnapshotData, SymbolState } from "../market-data-types";
import { type DataHandler, lastOf, pushWithMaxSize } from "./data-handler";
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
		return isNewPrice(state, snapshot);
	},
	mutateState({ data, state, maxSize }) {
		if (isNewPrice(state, data)) {
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

function isNewPrice(
	state: Pick<SymbolState, "prices">,
	snapshot: PriceSnapshotData
): boolean {
	const last = lastOf(state.prices);
	return last === undefined || snapshot.timestamp > last.timestamp;
}
