export const FEATURE_DIM = 32;
const SLIDING_WINDOW_SIZE = 8;

const FIELD_NAMES = [
	"candleClose", "candleVolume", "candleReturnRatio", "candlePositionRatio",
	"candleRangeRatio", "candleOpen", "candleHigh", "candleLow", "candleVolumeRatio",
	"orderBookAvgBid", "orderBookAvgAsk", "orderBookSpreadRatio", "orderBookImbalance",
	"bookTickerBid", "bookTickerAsk", "bookTickerSpreadRatio",
	"tradeAvgPrice", "tradeTotalQty", "tradeBuyRatio",
	"tickerPriceChange", "tickerVolume", "tickerDailyRange", "priceSnapshot",
] as const;

type FeatureFieldName = (typeof FIELD_NAMES)[number];

const _typeCheck: Record<FeatureFieldName, number> extends Partial<FeatureVector> ? true : never = true;

export class FeatureVector {
	candleClose = 0;
	candleVolume = 0;
	candleReturnRatio = 0;
	candlePositionRatio = 0;
	candleRangeRatio = 0;
	candleOpen = 0;
	candleHigh = 0;
	candleLow = 0;
	candleVolumeRatio = 0;
	orderBookAvgBid = 0;
	orderBookAvgAsk = 0;
	orderBookSpreadRatio = 0;
	orderBookImbalance = 0;
	bookTickerBid = 0;
	bookTickerAsk = 0;
	bookTickerSpreadRatio = 0;
	tradeAvgPrice = 0;
	tradeTotalQty = 0;
	tradeBuyRatio = 0;
	tickerPriceChange = 0;
	tickerVolume = 0;
	tickerDailyRange = 0;
	priceSnapshot = 0;
	private readonly _slidingWindow: Float32Array;
	bias = 0;

	constructor(data?: Float32Array) {
		this._slidingWindow = new Float32Array(SLIDING_WINDOW_SIZE);
		if (data instanceof Float32Array) {
			const fv = this as unknown as Record<FeatureFieldName, number>;
			for (let i = 0; i < FIELD_NAMES.length; i++) { fv[FIELD_NAMES[i]] = data[i] ?? 0; }
			for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { this._slidingWindow[i] = data[FIELD_NAMES.length + i] ?? 0; }
			this.bias = data[FEATURE_DIM - 1] ?? 0;
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector { return new FeatureVector(data); }

	toFloat32Array(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		const fv = this as unknown as Record<FeatureFieldName, number>;
		for (let i = 0; i < FIELD_NAMES.length; i++) { arr[i] = fv[FIELD_NAMES[i]]; }
		for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { arr[FIELD_NAMES.length + i] = this._slidingWindow[i]; }
		arr[FEATURE_DIM - 1] = this.bias;
		return arr;
	}

	slidingWindow(): Float32Array { return this._slidingWindow; }
}
