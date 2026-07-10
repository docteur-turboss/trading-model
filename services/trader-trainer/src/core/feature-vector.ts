export const FEATURE_DIM = 32;

type FeatureField = {
	get: (fv: FeatureVector) => number;
	set: (fv: FeatureVector, value: number) => void;
};

const FEATURE_FIELDS: FeatureField[] = [
	{ get: (f) => f.candle.close, set: (f, v) => { f.candle.close = v; } },
	{ get: (f) => f.candle.volume, set: (f, v) => { f.candle.volume = v; } },
	{ get: (f) => f.candle.returnRatio, set: (f, v) => { f.candle.returnRatio = v; } },
	{ get: (f) => f.candle.positionRatio, set: (f, v) => { f.candle.positionRatio = v; } },
	{ get: (f) => f.candle.rangeRatio, set: (f, v) => { f.candle.rangeRatio = v; } },
	{ get: (f) => f.candle.open, set: (f, v) => { f.candle.open = v; } },
	{ get: (f) => f.candle.high, set: (f, v) => { f.candle.high = v; } },
	{ get: (f) => f.candle.low, set: (f, v) => { f.candle.low = v; } },
	{ get: (f) => f.candle.volumeRatio, set: (f, v) => { f.candle.volumeRatio = v; } },
	{ get: (f) => f.orderBook.avgBid, set: (f, v) => { f.orderBook.avgBid = v; } },
	{ get: (f) => f.orderBook.avgAsk, set: (f, v) => { f.orderBook.avgAsk = v; } },
	{ get: (f) => f.orderBook.spreadRatio, set: (f, v) => { f.orderBook.spreadRatio = v; } },
	{ get: (f) => f.orderBook.imbalance, set: (f, v) => { f.orderBook.imbalance = v; } },
	{ get: (f) => f.bookTicker.bid, set: (f, v) => { f.bookTicker.bid = v; } },
	{ get: (f) => f.bookTicker.ask, set: (f, v) => { f.bookTicker.ask = v; } },
	{ get: (f) => f.bookTicker.spreadRatio, set: (f, v) => { f.bookTicker.spreadRatio = v; } },
	{ get: (f) => f.trade.avgPrice, set: (f, v) => { f.trade.avgPrice = v; } },
	{ get: (f) => f.trade.totalQty, set: (f, v) => { f.trade.totalQty = v; } },
	{ get: (f) => f.trade.buyRatio, set: (f, v) => { f.trade.buyRatio = v; } },
	{ get: (f) => f.ticker.priceChange, set: (f, v) => { f.ticker.priceChange = v; } },
	{ get: (f) => f.ticker.volume, set: (f, v) => { f.ticker.volume = v; } },
	{ get: (f) => f.ticker.dailyRange, set: (f, v) => { f.ticker.dailyRange = v; } },
	{ get: (f) => f.priceSnapshot, set: (f, v) => { f.priceSnapshot = v; } },
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
	private static readonly SLIDING_WINDOW_SIZE = 8;
	// Last element reserved for bias term
	private static readonly BIAS_INDEX = FEATURE_DIM - 1;
	private readonly _slidingWindow: Float32Array;
	private readonly _fv: FeatureVector;

	constructor(fv: FeatureVector) {
		this._fv = fv;
		this._slidingWindow = new Float32Array(FeatureVectorCodec.SLIDING_WINDOW_SIZE);
	}

	slidingWindow(): Float32Array {
		return this._slidingWindow;
	}

	encode(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		for (let i = 0; i < FEATURE_COUNT; i++) {
			arr[i] = FEATURE_FIELDS[i].get(this._fv);
		}
		for (let i = 0; i < FeatureVectorCodec.SLIDING_WINDOW_SIZE; i++) {
			arr[SLIDING_WINDOW_OFFSET + i] = this._slidingWindow[i];
		}
		arr[FeatureVectorCodec.BIAS_INDEX] = this._fv.bias;
		return arr;
	}

	decode(data: Float32Array): void {
		for (let i = 0; i < FEATURE_COUNT; i++) {
			FEATURE_FIELDS[i].set(this._fv, data[i] ?? 0);
		}
		for (let i = 0; i < FeatureVectorCodec.SLIDING_WINDOW_SIZE; i++) {
			this._slidingWindow[i] = data[SLIDING_WINDOW_OFFSET + i] ?? 0;
		}
		this._fv.bias = data[FeatureVectorCodec.BIAS_INDEX] ?? 0;
	}
}
