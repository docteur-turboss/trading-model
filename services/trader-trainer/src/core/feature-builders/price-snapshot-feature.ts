import type { PriceSnapshotFeatureContext } from "../feature-context";
import { toSymbol } from "../market-data-types";

export function buildPriceSnapshotFeature(
	ctx: PriceSnapshotFeatureContext
): void {
	const { features, state, idx, priceSnapshot } = ctx;
	const cur = state.candles[idx];
	const snapPrice =
		priceSnapshot[toSymbol(state.candles[idx].symbol)] ?? cur.close;
	features.priceSnapshot = state.norm.candleClose.normalize(snapPrice);
}
