import type { BookTickerData } from "@trading-model/contracts/market-data.types";
import type { DataHandler } from "./data-handler";
import { isAfterLast, pushWithMaxSize } from "./data-handler-utils";
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
		return isAfterLast(state.bookTickers, bt, "timestamp");
	},
	mutateState({ data, state, maxSize }) {
		if (isAfterLast(state.bookTickers, data, "timestamp")) {
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
