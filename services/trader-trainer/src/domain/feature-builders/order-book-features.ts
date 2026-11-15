import {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
} from "@trading-model/contracts/market-data.types";
import type { Price, Ratio } from "@trading-model/primitives/primitives";
import type { FeatureContext } from "../feature-context";

export function buildOrderBookFeatures(ctx: FeatureContext): void {
	const { features, state } = ctx;
	const ob = state.orderBook;
	if (ob) {
		const obAvg = {
			avgBid: getAvgBid(ob),
			avgAsk: getAvgAsk(ob),
			bidQty: getBidTotalQty(ob),
			askQty: getAskTotalQty(ob),
		};
		features.orderBook.avgBid = state.norm.book.bid.normalize(
			obAvg.avgBid
		) as Price;
		features.orderBook.avgAsk = state.norm.book.ask.normalize(
			obAvg.avgAsk
		) as Price;
		features.orderBook.spreadRatio = (
			obAvg.avgAsk > 0 && obAvg.avgBid > 0
				? (obAvg.avgAsk - obAvg.avgBid) / obAvg.avgAsk
				: 0
		) as Ratio;
		const totalQty = obAvg.bidQty + obAvg.askQty;
		features.orderBook.imbalance = (
			totalQty > 0 ? (obAvg.bidQty - obAvg.askQty) / totalQty : 0
		) as Ratio;
	}
}
