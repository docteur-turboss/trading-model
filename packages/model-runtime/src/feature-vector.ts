import { decodeInto, encode, SlidingWindowSize } from "./feature-vector-codec";
import { type CandleFeatures, emptyCandle } from "./features/candle-features";

export type { CandleFeatures } from "./features/candle-features";
export class FeatureVector {
	candle: CandleFeatures;
	bias = 0;
	/** Optional signal inputs (value, age, confidence per metric), after the market block. */
	signals: Float32Array = new Float32Array(0);
	private readonly _slidingWindow: Float32Array;

	constructor(data?: Float32Array) {
		this.candle = emptyCandle();
		this._slidingWindow = new Float32Array(SlidingWindowSize);
		if (data instanceof Float32Array) {
			decodeInto(this, data);
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector {
		return new FeatureVector(data);
	}

	toFloat32Array(): Float32Array {
		return encode(this);
	}

	slidingWindow(): Float32Array {
		return this._slidingWindow;
	}
}
