import type { FeatureContext } from "../feature-context";

export function buildBookTickerFeatures(ctx: FeatureContext): void {
	const { features, state } = ctx;
	if (state.bookTicker) {
		const bt = state.bookTicker;
		features.bookTicker.bid = state.norm.book.bid.normalize(bt.bid);
		features.bookTicker.ask = state.norm.book.ask.normalize(bt.ask);
		const spread = bt.ask - bt.bid;
		features.bookTicker.spreadRatio = bt.ask > 0 ? spread / bt.ask : 0;
	}
}
