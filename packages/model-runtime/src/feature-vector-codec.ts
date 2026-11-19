import type { FeatureVector } from "./feature-vector";

export const FEATURE_DIM = 18;
export const SlidingWindowSize = 8;

const BiasIndex = FEATURE_DIM - 1;

/** [layout name, key of the candle features]: the position in this list is the input index. */
const FEATURE_FIELDS: readonly (readonly [
	string,
	keyof FeatureVector["candle"],
])[] = [
	["CandleClose", "close"],
	["CandleVolume", "volume"],
	["CandleReturnRatio", "returnRatio"],
	["CandlePositionRatio", "positionRatio"],
	["CandleRangeRatio", "rangeRatio"],
	["CandleOpen", "open"],
	["CandleHigh", "high"],
	["CandleLow", "low"],
	["CandleVolumeRatio", "volumeRatio"],
];

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
	// Signal inputs follow the market block; none: exactly FEATURE_DIM values.
	const arr = new Float32Array(FEATURE_DIM + fv.signals.length);
	arr.set(fv.signals, FEATURE_DIM);
	const sw = fv.slidingWindow();

	FEATURE_FIELDS.forEach(([, key], index) => {
		arr[index] = fv.candle[key];
	});

	for (let i = 0; i < SlidingWindowSize; i++) {
		arr[SlidingWindowOffset + i] = sw[i];
	}
	arr[BiasIndex] = fv.bias;

	return arr;
}

export function decodeInto(fv: FeatureVector, data: Float32Array): void {
	const sw = fv.slidingWindow();

	FEATURE_FIELDS.forEach(([, key], index) => {
		// as unknown as: branded numbers are plain numbers at runtime
		(fv.candle as unknown as Record<string, number>)[key] = data[index];
	});

	for (let i = 0; i < SlidingWindowSize; i++) {
		sw[i] = data[SlidingWindowOffset + i] ?? 0;
	}
	fv.bias = data[BiasIndex] ?? 0;
	fv.signals = data.slice(FEATURE_DIM);
}
