import type { BookTickerData } from "@trading-model/common/config/event.types";
import type { SymbolState } from "../market-data-types";
import { DataType } from "./data-types";
import type { DataHandler } from "./data-handler";

export const bookTickerHandler: DataHandler<BookTickerData> = {
	dataType: DataType.BookTicker,
	updateNorms(state, bt) {
		if (bt.bid > 0) state.norm.bid.update(bt.bid);
		if (bt.ask > 0) state.norm.ask.update(bt.ask);
		if (bt.ask > 0 && bt.bid > 0) state.norm.spread.update(bt.ask - bt.bid);
	},
	mutateState(_symbol, data, state, _maxSize) {
		state.bookTicker = data;
	},
	serializeNorms(_state) {
		return {};
	},
};
