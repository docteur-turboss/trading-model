import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";
import { emptyBookTicker } from "./features/bookticker-features";
import { emptyCandle } from "./features/candle-features";
import { emptyOrderBook } from "./features/orderbook-features";
import { emptyTicker } from "./features/ticker-features";
import { emptyTrade } from "./features/trade-features";

export const FEATURE_DIM = 32;

interface FeatureField {
	get: (fv: FeatureVector) => number;
	set: (fv: FeatureVector, value: number) => void;
}

const FEATURE_FIELDS: FeatureField[] = [
	{
		get: (fv) => fv.candle.close,
		set: (fv, val) => {
			fv.candle.close = val as Price;
		},
	},
	{
		get: (fv) => fv.candle.volume,
		set: (fv, val) => {
			fv.candle.volume = val as Volume;
		},
	},
	{
		get: (fv) => fv.candle.returnRatio,
		set: (fv, val) => {
			fv.candle.returnRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.candle.positionRatio,
		set: (fv, val) => {
			fv.candle.positionRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.candle.rangeRatio,
		set: (fv, val) => {
			fv.candle.rangeRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.candle.open,
		set: (fv, val) => {
			fv.candle.open = val as Price;
		},
	},
	{
		get: (fv) => fv.candle.high,
		set: (fv, val) => {
			fv.candle.high = val as Price;
		},
	},
	{
		get: (fv) => fv.candle.low,
		set: (fv, val) => {
			fv.candle.low = val as Price;
		},
	},
	{
		get: (fv) => fv.candle.volumeRatio,
		set: (fv, val) => {
			fv.candle.volumeRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.orderBook.avgBid,
		set: (fv, val) => {
			fv.orderBook.avgBid = val as Price;
		},
	},
	{
		get: (fv) => fv.orderBook.avgAsk,
		set: (fv, val) => {
			fv.orderBook.avgAsk = val as Price;
		},
	},
	{
		get: (fv) => fv.orderBook.spreadRatio,
		set: (fv, val) => {
			fv.orderBook.spreadRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.orderBook.imbalance,
		set: (fv, val) => {
			fv.orderBook.imbalance = val as Ratio;
		},
	},
	{
		get: (fv) => fv.bookTicker.bid,
		set: (fv, val) => {
			fv.bookTicker.bid = val as Price;
		},
	},
	{
		get: (fv) => fv.bookTicker.ask,
		set: (fv, val) => {
			fv.bookTicker.ask = val as Price;
		},
	},
	{
		get: (fv) => fv.bookTicker.spreadRatio,
		set: (fv, val) => {
			fv.bookTicker.spreadRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.trade.avgPrice,
		set: (fv, val) => {
			fv.trade.avgPrice = val as Price;
		},
	},
	{
		get: (fv) => fv.trade.totalQty,
		set: (fv, val) => {
			fv.trade.totalQty = val as Volume;
		},
	},
	{
		get: (fv) => fv.trade.buyRatio,
		set: (fv, val) => {
			fv.trade.buyRatio = val as Ratio;
		},
	},
	{
		get: (fv) => fv.ticker.priceChange,
		set: (fv, val) => {
			fv.ticker.priceChange = val as Ratio;
		},
	},
	{
		get: (fv) => fv.ticker.volume,
		set: (fv, val) => {
			fv.ticker.volume = val as Volume;
		},
	},
	{
		get: (fv) => fv.ticker.dailyRange,
		set: (fv, val) => {
			fv.ticker.dailyRange = val as Ratio;
		},
	},
	{
		get: (fv) => fv.priceSnapshot,
		set: (fv, val) => {
			fv.priceSnapshot = val as Price;
		},
	},
];

const FEATURE_COUNT = FEATURE_FIELDS.length;
const SLIDING_WINDOW_OFFSET = FEATURE_COUNT;

export interface CandleFeatures {
	close: Price;
	volume: Volume;
	returnRatio: Ratio;
	positionRatio: Ratio;
	rangeRatio: Ratio;
	open: Price;
	high: Price;
	low: Price;
	volumeRatio: Ratio;
}

export interface OrderBookFeatures {
	avgBid: Price;
	avgAsk: Price;
	spreadRatio: Ratio;
	imbalance: Ratio;
}

export interface BookTickerFeatures {
	bid: Price;
	ask: Price;
	spreadRatio: Ratio;
}

export interface TradeFeatures {
	avgPrice: Price;
	totalQty: Volume;
	buyRatio: Ratio;
}

export interface TickerFeatures {
	priceChange: Ratio;
	volume: Volume;
	dailyRange: Ratio;
}

export class FeatureVector {
	candle: CandleFeatures;
	orderBook: OrderBookFeatures;
	bookTicker: BookTickerFeatures;
	trade: TradeFeatures;
	ticker: TickerFeatures;
	priceSnapshot: Price = 0 as Price;
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
