export const FEATURE_DIM = 32;

interface FeatureField {
	get: (fv: FeatureVector) => number;
	set: (fv: FeatureVector, value: number) => void;
}

const FEATURE_FIELDS: FeatureField[] = [
	{
		get: (fv) => fv.candle.close,
		set: (fv, val) => {
			fv.candle.close = val;
		},
	},
	{
		get: (fv) => fv.candle.volume,
		set: (fv, val) => {
			fv.candle.volume = val;
		},
	},
	{
		get: (fv) => fv.candle.returnRatio,
		set: (fv, val) => {
			fv.candle.returnRatio = val;
		},
	},
	{
		get: (fv) => fv.candle.positionRatio,
		set: (fv, val) => {
			fv.candle.positionRatio = val;
		},
	},
	{
		get: (fv) => fv.candle.rangeRatio,
		set: (fv, val) => {
			fv.candle.rangeRatio = val;
		},
	},
	{
		get: (fv) => fv.candle.open,
		set: (fv, val) => {
			fv.candle.open = val;
		},
	},
	{
		get: (fv) => fv.candle.high,
		set: (fv, val) => {
			fv.candle.high = val;
		},
	},
	{
		get: (fv) => fv.candle.low,
		set: (fv, val) => {
			fv.candle.low = val;
		},
	},
	{
		get: (fv) => fv.candle.volumeRatio,
		set: (fv, val) => {
			fv.candle.volumeRatio = val;
		},
	},
	{
		get: (fv) => fv.orderBook.avgBid,
		set: (fv, val) => {
			fv.orderBook.avgBid = val;
		},
	},
	{
		get: (fv) => fv.orderBook.avgAsk,
		set: (fv, val) => {
			fv.orderBook.avgAsk = val;
		},
	},
	{
		get: (fv) => fv.orderBook.spreadRatio,
		set: (fv, val) => {
			fv.orderBook.spreadRatio = val;
		},
	},
	{
		get: (fv) => fv.orderBook.imbalance,
		set: (fv, val) => {
			fv.orderBook.imbalance = val;
		},
	},
	{
		get: (fv) => fv.bookTicker.bid,
		set: (fv, val) => {
			fv.bookTicker.bid = val;
		},
	},
	{
		get: (fv) => fv.bookTicker.ask,
		set: (fv, val) => {
			fv.bookTicker.ask = val;
		},
	},
	{
		get: (fv) => fv.bookTicker.spreadRatio,
		set: (fv, val) => {
			fv.bookTicker.spreadRatio = val;
		},
	},
	{
		get: (fv) => fv.trade.avgPrice,
		set: (fv, val) => {
			fv.trade.avgPrice = val;
		},
	},
	{
		get: (fv) => fv.trade.totalQty,
		set: (fv, val) => {
			fv.trade.totalQty = val;
		},
	},
	{
		get: (fv) => fv.trade.buyRatio,
		set: (fv, val) => {
			fv.trade.buyRatio = val;
		},
	},
	{
		get: (fv) => fv.ticker.priceChange,
		set: (fv, val) => {
			fv.ticker.priceChange = val;
		},
	},
	{
		get: (fv) => fv.ticker.volume,
		set: (fv, val) => {
			fv.ticker.volume = val;
		},
	},
	{
		get: (fv) => fv.ticker.dailyRange,
		set: (fv, val) => {
			fv.ticker.dailyRange = val;
		},
	},
	{
		get: (fv) => fv.priceSnapshot,
		set: (fv, val) => {
			fv.priceSnapshot = val;
		},
	},
];

const FEATURE_COUNT = FEATURE_FIELDS.length;
const SLIDING_WINDOW_OFFSET = FEATURE_COUNT;

export interface CandleFeatures {
	close: number;
	volume: number;
	returnRatio: number;
	positionRatio: number;
	rangeRatio: number;
	open: number;
	high: number;
	low: number;
	volumeRatio: number;
}

export interface OrderBookFeatures {
	avgBid: number;
	avgAsk: number;
	spreadRatio: number;
	imbalance: number;
}

export interface BookTickerFeatures {
	bid: number;
	ask: number;
	spreadRatio: number;
}

export interface TradeFeatures {
	avgPrice: number;
	totalQty: number;
	buyRatio: number;
}

export interface TickerFeatures {
	priceChange: number;
	volume: number;
	dailyRange: number;
}

function emptyCandle(): CandleFeatures {
	return {
		close: 0,
		volume: 0,
		returnRatio: 0,
		positionRatio: 0,
		rangeRatio: 0,
		open: 0,
		high: 0,
		low: 0,
		volumeRatio: 0,
	};
}

function emptyOrderBook(): OrderBookFeatures {
	return { avgBid: 0, avgAsk: 0, spreadRatio: 0, imbalance: 0 };
}

function emptyBookTicker(): BookTickerFeatures {
	return { bid: 0, ask: 0, spreadRatio: 0 };
}

function emptyTrade(): TradeFeatures {
	return { avgPrice: 0, totalQty: 0, buyRatio: 0 };
}

function emptyTicker(): TickerFeatures {
	return { priceChange: 0, volume: 0, dailyRange: 0 };
}

export class FeatureVector {
	candle: CandleFeatures;
	orderBook: OrderBookFeatures;
	bookTicker: BookTickerFeatures;
	trade: TradeFeatures;
	ticker: TickerFeatures;
	priceSnapshot = 0;
	private readonly _codec: FeatureVectorCodec;
	bias = 0;

	constructor(data?: Float32Array) {
		this.candle = emptyCandle();
		this.orderBook = emptyOrderBook();
		this.bookTicker = emptyBookTicker();
		this.trade = emptyTrade();
		this.ticker = emptyTicker();
		this._codec = new FeatureVectorCodec(this);
		if (data instanceof Float32Array) {
			this._codec.decode(data);
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector {
		return new FeatureVector(data);
	}

	toFloat32Array(): Float32Array {
		return this._codec.encode();
	}

	slidingWindow(): Float32Array {
		return this._codec.slidingWindow();
	}
}

class FeatureVectorCodec {
	private static readonly _SLIDING_WINDOW_SIZE = 8;
	// Last element reserved for bias term
	private static readonly _BIAS_INDEX = FEATURE_DIM - 1;
	private readonly _slidingWindow: Float32Array;
	private readonly _fv: FeatureVector;

	constructor(fv: FeatureVector) {
		this._fv = fv;
		this._slidingWindow = new Float32Array(
			FeatureVectorCodec._SLIDING_WINDOW_SIZE
		);
	}

	slidingWindow(): Float32Array {
		return this._slidingWindow;
	}

	encode(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		for (let i = 0; i < FEATURE_COUNT; i++) {
			arr[i] = FEATURE_FIELDS[i].get(this._fv);
		}
		for (let i = 0; i < FeatureVectorCodec._SLIDING_WINDOW_SIZE; i++) {
			arr[SLIDING_WINDOW_OFFSET + i] = this._slidingWindow[i];
		}
		arr[FeatureVectorCodec._BIAS_INDEX] = this._fv.bias;
		return arr;
	}

	decode(data: Float32Array): void {
		for (let i = 0; i < FEATURE_COUNT; i++) {
			FEATURE_FIELDS[i].set(this._fv, data[i] ?? 0);
		}
		for (let i = 0; i < FeatureVectorCodec._SLIDING_WINDOW_SIZE; i++) {
			this._slidingWindow[i] = data[SLIDING_WINDOW_OFFSET + i] ?? 0;
		}
		this._fv.bias = data[FeatureVectorCodec._BIAS_INDEX] ?? 0;
	}
}
