export const FEATURE_DIM = 32;
const SLIDING_WINDOW_SIZE = 8;
const FEATURE_COUNT = 23;

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
			this.candleClose = data[0] ?? 0;
			this.candleVolume = data[1] ?? 0;
			this.candleReturnRatio = data[2] ?? 0;
			this.candlePositionRatio = data[3] ?? 0;
			this.candleRangeRatio = data[4] ?? 0;
			this.candleOpen = data[5] ?? 0;
			this.candleHigh = data[6] ?? 0;
			this.candleLow = data[7] ?? 0;
			this.candleVolumeRatio = data[8] ?? 0;
			this.orderBookAvgBid = data[9] ?? 0;
			this.orderBookAvgAsk = data[10] ?? 0;
			this.orderBookSpreadRatio = data[11] ?? 0;
			this.orderBookImbalance = data[12] ?? 0;
			this.bookTickerBid = data[13] ?? 0;
			this.bookTickerAsk = data[14] ?? 0;
			this.bookTickerSpreadRatio = data[15] ?? 0;
			this.tradeAvgPrice = data[16] ?? 0;
			this.tradeTotalQty = data[17] ?? 0;
			this.tradeBuyRatio = data[18] ?? 0;
			this.tickerPriceChange = data[19] ?? 0;
			this.tickerVolume = data[20] ?? 0;
			this.tickerDailyRange = data[21] ?? 0;
			this.priceSnapshot = data[22] ?? 0;
			for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { this._slidingWindow[i] = data[FEATURE_COUNT + i] ?? 0; }
			this.bias = data[FEATURE_DIM - 1] ?? 0;
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector { return new FeatureVector(data); }

	toFloat32Array(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		arr[0] = this.candleClose;
		arr[1] = this.candleVolume;
		arr[2] = this.candleReturnRatio;
		arr[3] = this.candlePositionRatio;
		arr[4] = this.candleRangeRatio;
		arr[5] = this.candleOpen;
		arr[6] = this.candleHigh;
		arr[7] = this.candleLow;
		arr[8] = this.candleVolumeRatio;
		arr[9] = this.orderBookAvgBid;
		arr[10] = this.orderBookAvgAsk;
		arr[11] = this.orderBookSpreadRatio;
		arr[12] = this.orderBookImbalance;
		arr[13] = this.bookTickerBid;
		arr[14] = this.bookTickerAsk;
		arr[15] = this.bookTickerSpreadRatio;
		arr[16] = this.tradeAvgPrice;
		arr[17] = this.tradeTotalQty;
		arr[18] = this.tradeBuyRatio;
		arr[19] = this.tickerPriceChange;
		arr[20] = this.tickerVolume;
		arr[21] = this.tickerDailyRange;
		arr[22] = this.priceSnapshot;
		for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { arr[FEATURE_COUNT + i] = this._slidingWindow[i]; }
		arr[FEATURE_DIM - 1] = this.bias;
		return arr;
	}

	slidingWindow(): Float32Array { return this._slidingWindow; }
}
