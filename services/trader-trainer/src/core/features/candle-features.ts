import type { Ratio } from "@trading-model/common/domain/primitives";

export interface OhlcvNormalized {
	close: number;
	volume: number;
	open: number;
	high: number;
	low: number;
}

export interface CandleFeatures extends OhlcvNormalized {
	returnRatio: Ratio;
	positionRatio: Ratio;
	rangeRatio: Ratio;
	volumeRatio: Ratio;
}

export function emptyCandle(): CandleFeatures {
	return {
		close: 0,
		volume: 0,
		returnRatio: 0 as Ratio,
		positionRatio: 0 as Ratio,
		rangeRatio: 0 as Ratio,
		open: 0,
		high: 0,
		low: 0,
		volumeRatio: 0 as Ratio,
	};
}
