import type { FeatureVector } from "./feature-vector";

export const FEATURE_DIM = 32;
export const SlidingWindowSize = 8;

const BiasIndex = FEATURE_DIM - 1;

type FeatureGroup = "candle" | "orderBook" | "bookTicker" | "trade" | "ticker";

/** [layout name, FeatureVector group, key]: the position in this list is the input index. */
type FeatureField =
	| {
			[TGroup in FeatureGroup]: readonly [
				string,
				TGroup,
				keyof FeatureVector[TGroup] & string,
			];
	  }[FeatureGroup]
	| readonly [string, null, "priceSnapshot"];

const FEATURE_FIELDS: readonly FeatureField[] = [
	["CandleClose", "candle", "close"],
	["CandleVolume", "candle", "volume"],
	["CandleReturnRatio", "candle", "returnRatio"],
	["CandlePositionRatio", "candle", "positionRatio"],
	["CandleRangeRatio", "candle", "rangeRatio"],
	["CandleOpen", "candle", "open"],
	["CandleHigh", "candle", "high"],
	["CandleLow", "candle", "low"],
	["CandleVolumeRatio", "candle", "volumeRatio"],
	["OrderBookAvgBid", "orderBook", "avgBid"],
	["OrderBookAvgAsk", "orderBook", "avgAsk"],
	["OrderBookSpreadRatio", "orderBook", "spreadRatio"],
	["OrderBookImbalance", "orderBook", "imbalance"],
	["BookTickerBid", "bookTicker", "bid"],
	["BookTickerAsk", "bookTicker", "ask"],
	["BookTickerSpreadRatio", "bookTicker", "spreadRatio"],
	["TradeAvgPrice", "trade", "avgPrice"],
	["TradeTotalQty", "trade", "totalQty"],
	["TradeBuyRatio", "trade", "buyRatio"],
	["TickerPriceChange", "ticker", "priceChange"],
	["TickerVolume", "ticker", "volume"],
	["TickerDailyRange", "ticker", "dailyRange"],
	["PriceSnapshot", null, "priceSnapshot"],
];

/** The object holding a field; branded numbers are plain numbers at runtime. */
function holder(
	fv: FeatureVector,
	group: FeatureGroup | null
): Record<string, number> {
	return (group === null ? fv : fv[group]) as unknown as Record<string, number>;
}

/**
 * Meaning of each market input, by index (model artifacts, ADR-0022): the
 * named fields, the normalized closes of the previous candles (oldest first,
 * 0 before the first one), then the bias. A model trained on one layout
 * cannot run on another.
 */
export const FEATURE_LAYOUT: { dim: number; fields: string[] } = {
	dim: FEATURE_DIM,
	fields: [
		...FEATURE_FIELDS.map(([name]) => name),
		...Array.from(
			{ length: SlidingWindowSize },
			(_unused, idx) => `SlidingWindowClose${idx}`
		),
		"Bias",
	],
};

const SlidingWindowOffset = FEATURE_FIELDS.length;

export function encode(fv: FeatureVector): Float32Array {
	const arr = new Float32Array(FEATURE_DIM);
	const sw = fv.slidingWindow();

	FEATURE_FIELDS.forEach(([, group, key], index) => {
		arr[index] = holder(fv, group)[key];
	});

	for (let i = 0; i < SlidingWindowSize; i++) {
		arr[SlidingWindowOffset + i] = sw[i];
	}
	arr[BiasIndex] = fv.bias;

	return arr;
}

export function decodeInto(fv: FeatureVector, data: Float32Array): void {
	const sw = fv.slidingWindow();

	FEATURE_FIELDS.forEach(([, group, key], index) => {
		holder(fv, group)[key] = data[index];
	});

	for (let i = 0; i < SlidingWindowSize; i++) {
		sw[i] = data[SlidingWindowOffset + i] ?? 0;
	}
	fv.bias = data[BiasIndex] ?? 0;
}
