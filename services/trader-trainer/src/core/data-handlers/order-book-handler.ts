import {
	getAvgAsk,
	getAvgBid,
	type OrderBookData,
} from "@trading-model/common/config/event.types";
import type { SymbolState } from "../market-data-types";
import type { DataHandler } from "./data-handler";

export const orderBookHandler: DataHandler<OrderBookData> = {
	dataType: "orderBook",
	updateNorms(state, orderBook) {
		const avgBid = getAvgBid(orderBook);
		const avgAsk = getAvgAsk(orderBook);
		if (avgBid > 0) state.norm.bid.update(avgBid);
		if (avgAsk > 0) state.norm.ask.update(avgAsk);
		if (avgAsk > 0 && avgBid > 0) state.norm.spread.update(avgAsk - avgBid);
	},
	mutateState(_symbol, data, state, _maxSize) {
		state.orderBook = data;
	},
	serializeNorms(state) {
		return {
			bidNorm: state.norm.bid.toJSON(),
			askNorm: state.norm.ask.toJSON(),
			spreadNorm: state.norm.spread.toJSON(),
		};
	},
};
