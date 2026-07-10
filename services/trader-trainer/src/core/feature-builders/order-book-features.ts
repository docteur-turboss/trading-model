import {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
	type OrderBookData,
} from "@trading-model/common/config/event.types";
import type { FeatureContext } from "../feature-context";
import type { SymbolState } from "../market-data-types";
import type { OrderBookAverages } from "../order-book-averages";

function computeOrderBookAverages(ob: OrderBookData): OrderBookAverages {
	return {
		avgBid: getAvgBid(ob),
		avgAsk: getAvgAsk(ob),
		bidQty: getBidTotalQty(ob),
		askQty: getAskTotalQty(ob),
	};
}

function orderBookAverages(state: SymbolState): OrderBookAverages | null {
	if (!state.orderBook) {
		return null;
	}
	return computeOrderBookAverages(state.orderBook);
}

export function buildOrderBookFeatures(ctx: FeatureContext): void {
	const { features, state } = ctx;
	const obAvg = orderBookAverages(state);
	if (obAvg) {
		features.orderBook.avgBid = state.norm.book.bid.normalize(obAvg.avgBid);
		features.orderBook.avgAsk = state.norm.book.ask.normalize(obAvg.avgAsk);
		features.orderBook.spreadRatio =
			obAvg.avgAsk > 0 && obAvg.avgBid > 0
				? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk
				: 0;
		const totalQty = obAvg.bidQty + obAvg.askQty;
		features.orderBook.imbalance =
			totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0;
	}
}
