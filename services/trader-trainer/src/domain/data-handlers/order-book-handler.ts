import {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
	type OrderBookData,
} from "@trading-model/contracts/market-data.types";
import { NormalizationStats } from "../normalization-stats";
import { type DataHandler, isAfterLast, pushWithMaxSize } from "./data-handler";
import { DataType } from "./data-types";

export const orderBookHandler: DataHandler<OrderBookData> = {
	dataType: DataType.OrderBook,
	createState() {
		return { orderBooks: [] };
	},
	createNorms() {
		return {
			book: {
				bid: new NormalizationStats(),
				ask: new NormalizationStats(),
				spread: new NormalizationStats(),
			},
		};
	},
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
	isNew(state, orderBook) {
		return isAfterLast(state.orderBooks, orderBook, "timestamp");
	},
	mutateState({ data, state, maxSize }) {
		if (isAfterLast(state.orderBooks, data, "timestamp")) {
			state.orderBooks = pushWithMaxSize(
				state.orderBooks,
				compactOrderBook(data),
				maxSize
			);
		}
	},
	estimateMemoryBytes(state) {
		return state.orderBooks.length * 160;
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

/**
 * One level per side at the side's average price and total quantity: the
 * averages and quantities the features read are unchanged, and a history of
 * a few thousand snapshots stays small.
 */
function compactOrderBook(orderBook: OrderBookData): OrderBookData {
	return {
		...orderBook,
		bids: new Set([
			{ price: getAvgBid(orderBook), quantity: getBidTotalQty(orderBook) },
		]),
		asks: new Set([
			{ price: getAvgAsk(orderBook), quantity: getAskTotalQty(orderBook) },
		]),
	};
}
