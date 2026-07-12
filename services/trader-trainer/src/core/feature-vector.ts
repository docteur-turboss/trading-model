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
	private static readonly _FEATURE_COUNT = 23;
	private static readonly _SLIDING_WINDOW_SIZE = 8;
	private static readonly _SLIDING_WINDOW_OFFSET =
		FeatureVectorCodec._FEATURE_COUNT;
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

		arr[0] = fv.candle.close;
		arr[1] = fv.candle.volume;
		arr[2] = fv.candle.returnRatio;
		arr[3] = fv.candle.positionRatio;
		arr[4] = fv.candle.rangeRatio;
		arr[5] = fv.candle.open;
		arr[6] = fv.candle.high;
		arr[7] = fv.candle.low;
		arr[8] = fv.candle.volumeRatio;
		arr[9] = fv.orderBook.avgBid;
		arr[10] = fv.orderBook.avgAsk;
		arr[11] = fv.orderBook.spreadRatio;
		arr[12] = fv.orderBook.imbalance;
		arr[13] = fv.bookTicker.bid;
		arr[14] = fv.bookTicker.ask;
		arr[15] = fv.bookTicker.spreadRatio;
		arr[16] = fv.trade.avgPrice;
		arr[17] = fv.trade.totalQty;
		arr[18] = fv.trade.buyRatio;
		arr[19] = fv.ticker.priceChange;
		arr[20] = fv.ticker.volume;
		arr[21] = fv.ticker.dailyRange;
		arr[22] = fv.priceSnapshot;

		for (let i = 0; i < FeatureVectorCodec._SLIDING_WINDOW_SIZE; i++) {
			arr[FeatureVectorCodec._SLIDING_WINDOW_OFFSET + i] = sw[i];
		}
		arr[FeatureVectorCodec._BIAS_INDEX] = fv.bias;

		return arr;
	}

	decode(data: Float32Array): void {
		const fv = this._fv;
		const sw = this._slidingWindow;

		fv.candle.close = data[0] as Price;
		fv.candle.volume = data[1] as Volume;
		fv.candle.returnRatio = data[2] as Ratio;
		fv.candle.positionRatio = data[3] as Ratio;
		fv.candle.rangeRatio = data[4] as Ratio;
		fv.candle.open = data[5] as Price;
		fv.candle.high = data[6] as Price;
		fv.candle.low = data[7] as Price;
		fv.candle.volumeRatio = data[8] as Ratio;
		fv.orderBook.avgBid = data[9] as Price;
		fv.orderBook.avgAsk = data[10] as Price;
		fv.orderBook.spreadRatio = data[11] as Ratio;
		fv.orderBook.imbalance = data[12] as Ratio;
		fv.bookTicker.bid = data[13] as Price;
		fv.bookTicker.ask = data[14] as Price;
		fv.bookTicker.spreadRatio = data[15] as Ratio;
		fv.trade.avgPrice = data[16] as Price;
		fv.trade.totalQty = data[17] as Volume;
		fv.trade.buyRatio = data[18] as Ratio;
		fv.ticker.priceChange = data[19] as Ratio;
		fv.ticker.volume = data[20] as Volume;
		fv.ticker.dailyRange = data[21] as Ratio;
		fv.priceSnapshot = data[22] as Price;

		for (let i = 0; i < FeatureVectorCodec._SLIDING_WINDOW_SIZE; i++) {
			sw[i] = data[FeatureVectorCodec._SLIDING_WINDOW_OFFSET + i] ?? 0;
		}
		fv.bias = data[FeatureVectorCodec._BIAS_INDEX] ?? 0;
	}
}
