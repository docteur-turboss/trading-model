import {
	getAvgAsk,
	getAvgBid,
	type OrderBookData,
} from "@trading-model/common/config/event.types";
import type { DataHandler } from "./data-handler";
import { DataType } from "./data-types";

export const orderBookHandler: DataHandler<OrderBookData> = {
	dataType: DataType.OrderBook,
	updateNorms(state, orderBook) {
		const avgBid = getAvgBid(orderBook);
		const avgAsk = getAvgAsk(orderBook);
		if (avgBid > 0) {
			state.norm.book.bid.update(avgBid);
		}
		if (avgAsk > 0) {
			state.norm.book.ask.update(avgAsk);
		}
		if (avgAsk > 0 && avgBid > 0) {
			state.norm.book.spread.update(avgAsk - avgBid);
		}
	},
	mutateState(_symbol, data, state, _maxSize) {
		state.orderBook = data;
	},
	serializeNorms(state) {
		return {
			book: {
				bid: state.norm.book.bid.toJSON(),
				ask: state.norm.book.ask.toJSON(),
				spread: state.norm.book.spread.toJSON(),
			},
		};
	},
};
