import type { CandleData } from "@trading-model/common/config/event.types";
import type { CandleFeatureContext } from "../feature-context";
import type { SymbolState } from "../market-data-types";

export function candleReturnRatio(cur: CandleData, prev?: CandleData): number {
	return prev && prev.close > 0 ? (cur.close - prev.close) / prev.close : 0;
}

export function candlePositionRatio(cur: CandleData): number {
	return cur.high - cur.low > 0
		? (cur.close - cur.open) / (cur.high - cur.low)
		: 0;
}

export function candleRangeRatio(cur: CandleData): number {
	return cur.close > 0 ? (cur.high - cur.low) / cur.close : 0;
}

export function candleVolumeRatio(cur: CandleData, state: SymbolState): number {
	const volStd = state.norm.candleVolume.getStd();
	return volStd > 1e-10 ? cur.volume / volStd : 0;
}

export function buildCandleFeatures(ctx: CandleFeatureContext): void {
	const { features, state, idx } = ctx;
	const cur = state.candles[idx];
	features.candle.close = state.norm.candleClose.normalize(cur.close);
	features.candle.volume = state.norm.candleVolume.normalize(cur.volume);
	features.candle.returnRatio = candleReturnRatio(cur, ctx.prev);
	features.candle.positionRatio = candlePositionRatio(cur);
	features.candle.rangeRatio = candleRangeRatio(cur);
	features.candle.open = state.norm.candleOpen.normalize(cur.open);
	features.candle.high = state.norm.candleHigh.normalize(cur.high);
	features.candle.low = state.norm.candleLow.normalize(cur.low);
	features.candle.volumeRatio = candleVolumeRatio(cur, state);
}
