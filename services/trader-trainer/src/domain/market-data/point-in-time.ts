import { DataType } from "../data-handlers/data-types";
import type { FeatureState, SymbolState } from "../market-data-types";
import type { NormalizationManager } from "../normalization-manager";

/**
 * Visits each candle with the normalisation statistics of the candles known at
 * its close, oldest first (ADR-0030): statistics of the whole window would
 * leak the future into training and into walk-forward validation. The window
 * is the only input, so two pods build the same steps (ADR-0078).
 */
export function forEachPointInTime(
	state: SymbolState,
	normManager: NormalizationManager,
	visit: (view: FeatureState, idx: number) => void
): void {
	const norm = normManager.createNormStats();
	state.candles.forEach((candle, idx) => {
		normManager.updateNorms(DataType.Candle, { norm }, candle);
		visit({ candles: state.candles, norm }, idx);
	});
}
