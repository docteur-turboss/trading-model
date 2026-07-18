import type { CandleData } from "@trading-model/common/config/event.types";
import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";
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
	const volStd = state.norm.candle.volume.getStd();
	return volStd > 1e-10 ? cur.volume / volStd : 0;
}

export function buildCandleFeatures(ctx: CandleFeatureContext): void {
	const { features, state, idx } = ctx;
	const cur = state.candles[idx];
	features.candle.close = state.norm.candle.close.normalize(cur.close) as Price;
	features.candle.volume = state.norm.candle.volume.normalize(
		cur.volume
	) as Volume;
	features.candle.returnRatio = candleReturnRatio(cur, ctx.prev) as Ratio;
	features.candle.positionRatio = candlePositionRatio(cur) as Ratio;
	features.candle.rangeRatio = candleRangeRatio(cur) as Ratio;
	features.candle.open = state.norm.candle.open.normalize(cur.open) as Price;
	features.candle.high = state.norm.candle.high.normalize(cur.high) as Price;
	features.candle.low = state.norm.candle.low.normalize(cur.low) as Price;
	features.candle.volumeRatio = candleVolumeRatio(cur, state) as Ratio;
}
