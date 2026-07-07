import type { FeatureContext } from "../feature-context";

export function buildBookTickerFeatures(ctx: FeatureContext): void {
	const { features, state } = ctx;
	if (state.bookTicker) {
		const bt = state.bookTicker;
		features.bookTickerBid = state.norm.bid.normalize(bt.bid);
		features.bookTickerAsk = state.norm.ask.normalize(bt.ask);
		const spread = bt.ask - bt.bid;
		features.bookTickerSpreadRatio = bt.ask > 0 ? spread / bt.ask : 0;
	}
}
