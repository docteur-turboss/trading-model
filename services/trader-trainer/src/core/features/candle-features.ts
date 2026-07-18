import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";

export interface CandleFeatures {
	returnRatio: Ratio;
	positionRatio: Ratio;
	rangeRatio: Ratio;
	volumeRatio: Ratio;
	close: Price;
	volume: Volume;
	open: Price;
	high: Price;
	low: Price;
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
