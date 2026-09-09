import type { Price } from "@trading-model/common/domain/primitives";
import { decodeInto, encode, SlidingWindowSize } from "./feature-vector-codec";
import {
	type BookTickerFeatures,
	emptyBookTicker,
} from "./features/bookticker-features";
import { type CandleFeatures, emptyCandle } from "./features/candle-features";
import {
	emptyOrderBook,
	type OrderBookFeatures,
} from "./features/orderbook-features";
import { emptyTicker, type TickerFeatures } from "./features/ticker-features";
import { emptyTrade, type TradeFeatures } from "./features/trade-features";

export { FEATURE_DIM } from "./feature-vector-codec";
export type { BookTickerFeatures } from "./features/bookticker-features";
export type { CandleFeatures } from "./features/candle-features";
export type { OrderBookFeatures } from "./features/orderbook-features";
export type { TickerFeatures } from "./features/ticker-features";
export type { TradeFeatures } from "./features/trade-features";
export class FeatureVector {
	candle: CandleFeatures;
	orderBook: OrderBookFeatures;
	bookTicker: BookTickerFeatures;
	trade: TradeFeatures;
	ticker: TickerFeatures;
	priceSnapshot: Price = 0 as Price;
	bias = 0;
	private readonly _slidingWindow: Float32Array;

	constructor(data?: Float32Array) {
		this.candle = emptyCandle();
		this.orderBook = emptyOrderBook();
		this.bookTicker = emptyBookTicker();
		this.trade = emptyTrade();
		this.ticker = emptyTicker();
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
