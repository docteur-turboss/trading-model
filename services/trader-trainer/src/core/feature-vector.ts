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

const FEATURE_COUNT = 23;
const SLIDING_WINDOW_OFFSET = FEATURE_COUNT;

const FEATURE_INDEX = {
	CLOSE: 0,
	VOLUME: 1,
	RETURN_RATIO: 2,
	POSITION_RATIO: 3,
	RANGE_RATIO: 4,
	OPEN: 5,
	HIGH: 6,
	LOW: 7,
	VOLUME_RATIO: 8,
	AVG_BID: 9,
	AVG_ASK: 10,
	SPREAD_RATIO_OB: 11,
	IMBALANCE: 12,
	BID: 13,
	ASK: 14,
	SPREAD_RATIO_BT: 15,
	AVG_PRICE: 16,
	TOTAL_QTY: 17,
	BUY_RATIO: 18,
	PRICE_CHANGE: 19,
	TICKER_VOLUME: 20,
	DAILY_RANGE: 21,
	PRICE_SNAPSHOT: 22,
} as const;

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
		const fv = this._fv;
		const sw = this._slidingWindow;

		arr[FEATURE_INDEX.CLOSE] = fv.candle.close;
		arr[FEATURE_INDEX.VOLUME] = fv.candle.volume;
		arr[FEATURE_INDEX.RETURN_RATIO] = fv.candle.returnRatio;
		arr[FEATURE_INDEX.POSITION_RATIO] = fv.candle.positionRatio;
		arr[FEATURE_INDEX.RANGE_RATIO] = fv.candle.rangeRatio;
		arr[FEATURE_INDEX.OPEN] = fv.candle.open;
		arr[FEATURE_INDEX.HIGH] = fv.candle.high;
		arr[FEATURE_INDEX.LOW] = fv.candle.low;
		arr[FEATURE_INDEX.VOLUME_RATIO] = fv.candle.volumeRatio;
		arr[FEATURE_INDEX.AVG_BID] = fv.orderBook.avgBid;
		arr[FEATURE_INDEX.AVG_ASK] = fv.orderBook.avgAsk;
		arr[FEATURE_INDEX.SPREAD_RATIO_OB] = fv.orderBook.spreadRatio;
		arr[FEATURE_INDEX.IMBALANCE] = fv.orderBook.imbalance;
		arr[FEATURE_INDEX.BID] = fv.bookTicker.bid;
		arr[FEATURE_INDEX.ASK] = fv.bookTicker.ask;
		arr[FEATURE_INDEX.SPREAD_RATIO_BT] = fv.bookTicker.spreadRatio;
		arr[FEATURE_INDEX.AVG_PRICE] = fv.trade.avgPrice;
		arr[FEATURE_INDEX.TOTAL_QTY] = fv.trade.totalQty;
		arr[FEATURE_INDEX.BUY_RATIO] = fv.trade.buyRatio;
		arr[FEATURE_INDEX.PRICE_CHANGE] = fv.ticker.priceChange;
		arr[FEATURE_INDEX.TICKER_VOLUME] = fv.ticker.volume;
		arr[FEATURE_INDEX.DAILY_RANGE] = fv.ticker.dailyRange;
		arr[FEATURE_INDEX.PRICE_SNAPSHOT] = fv.priceSnapshot;

		for (let i = 0; i < FeatureVectorCodec._SLIDING_WINDOW_SIZE; i++) {
			arr[SLIDING_WINDOW_OFFSET + i] = sw[i];
		}
		arr[FeatureVectorCodec._BIAS_INDEX] = fv.bias;

		return arr;
	}

	decode(data: Float32Array): void {
		const fv = this._fv;
		const sw = this._slidingWindow;

		fv.candle.close = data[FEATURE_INDEX.CLOSE] as Price;
		fv.candle.volume = data[FEATURE_INDEX.VOLUME] as Volume;
		fv.candle.returnRatio = data[FEATURE_INDEX.RETURN_RATIO] as Ratio;
		fv.candle.positionRatio = data[FEATURE_INDEX.POSITION_RATIO] as Ratio;
		fv.candle.rangeRatio = data[FEATURE_INDEX.RANGE_RATIO] as Ratio;
		fv.candle.open = data[FEATURE_INDEX.OPEN] as Price;
		fv.candle.high = data[FEATURE_INDEX.HIGH] as Price;
		fv.candle.low = data[FEATURE_INDEX.LOW] as Price;
		fv.candle.volumeRatio = data[FEATURE_INDEX.VOLUME_RATIO] as Ratio;
		fv.orderBook.avgBid = data[FEATURE_INDEX.AVG_BID] as Price;
		fv.orderBook.avgAsk = data[FEATURE_INDEX.AVG_ASK] as Price;
		fv.orderBook.spreadRatio = data[FEATURE_INDEX.SPREAD_RATIO_OB] as Ratio;
		fv.orderBook.imbalance = data[FEATURE_INDEX.IMBALANCE] as Ratio;
		fv.bookTicker.bid = data[FEATURE_INDEX.BID] as Price;
		fv.bookTicker.ask = data[FEATURE_INDEX.ASK] as Price;
		fv.bookTicker.spreadRatio = data[FEATURE_INDEX.SPREAD_RATIO_BT] as Ratio;
		fv.trade.avgPrice = data[FEATURE_INDEX.AVG_PRICE] as Price;
		fv.trade.totalQty = data[FEATURE_INDEX.TOTAL_QTY] as Volume;
		fv.trade.buyRatio = data[FEATURE_INDEX.BUY_RATIO] as Ratio;
		fv.ticker.priceChange = data[FEATURE_INDEX.PRICE_CHANGE] as Ratio;
		fv.ticker.volume = data[FEATURE_INDEX.TICKER_VOLUME] as Volume;
		fv.ticker.dailyRange = data[FEATURE_INDEX.DAILY_RANGE] as Ratio;
		fv.priceSnapshot = data[FEATURE_INDEX.PRICE_SNAPSHOT] as Price;

		for (let i = 0; i < FeatureVectorCodec._SLIDING_WINDOW_SIZE; i++) {
			sw[i] = data[SLIDING_WINDOW_OFFSET + i] ?? 0;
		}
		fv.bias = data[FeatureVectorCodec._BIAS_INDEX] ?? 0;
	}
}
