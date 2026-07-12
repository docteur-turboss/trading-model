import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";

export interface OhlcvNormalized {
	close: Price;
	volume: Volume;
	open: Price;
	high: Price;
	low: Price;
}

export interface CandleFeatures extends OhlcvNormalized {
	returnRatio: Ratio;
	positionRatio: Ratio;
	rangeRatio: Ratio;
	volumeRatio: Ratio;
}

export function emptyCandle(): CandleFeatures {
	return {
		close: 0 as Price,
		volume: 0 as Volume,
		returnRatio: 0 as Ratio,
		positionRatio: 0 as Ratio,
		rangeRatio: 0 as Ratio,
		open: 0 as Price,
		high: 0 as Price,
		low: 0 as Price,
		volumeRatio: 0 as Ratio,
	};
}
