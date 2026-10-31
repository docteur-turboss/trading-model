import type { BookTickerData } from "@trading-model/contracts/market-data.types";
import type { SymbolState } from "../market-data-types";
import { type DataHandler, lastOf, pushWithMaxSize } from "./data-handler";
import { DataType } from "./data-types";

export const bookTickerHandler: DataHandler<BookTickerData> = {
	dataType: DataType.BookTicker,
	createState() {
		return { bookTickers: [] };
	},
	createNorms() {
		return {};
	},
	updateNorms(state, bt) {
		if (bt.bid > 0) {
			state.norm.book.bid.update(bt.bid);
		}
		if (bt.ask > 0) {
			state.norm.book.ask.update(bt.ask);
		}
		if (bt.ask > 0 && bt.bid > 0) {
			state.norm.book.spread.update(bt.ask - bt.bid);
		}
	},
	isNew(state, bt) {
		return isNewBookTicker(state, bt);
	},
	mutateState({ data, state, maxSize }) {
		if (isNewBookTicker(state, data)) {
			state.bookTickers = pushWithMaxSize(state.bookTickers, data, maxSize);
		}
	},
	estimateMemoryBytes(state) {
		return state.bookTickers.length * 128;
	},
	serializeNorms(_state) {
		return {};
	},
};

function isNewBookTicker(
	state: Pick<SymbolState, "bookTickers">,
	bt: BookTickerData
): boolean {
	const last = lastOf(state.bookTickers);
	return last === undefined || bt.timestamp > last.timestamp;
}
