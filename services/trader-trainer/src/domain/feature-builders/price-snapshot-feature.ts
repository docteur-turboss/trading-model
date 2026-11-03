import type { Price } from "@trading-model/primitives/primitives";
import type { FeatureContext } from "../feature-context";

/** Latest price ticker known at the candle close, else the close itself. */
export function buildPriceSnapshotFeature(ctx: FeatureContext): void {
	const { features, state, idx } = ctx;
	const snapPrice = state.price ?? state.candles[idx].close;
	features.priceSnapshot = state.norm.candle.close.normalize(
		snapPrice
	) as Price;
}
