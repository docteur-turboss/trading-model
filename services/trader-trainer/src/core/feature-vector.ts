import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";
import { emptyBookTicker } from "./features/bookticker-features";
import { type CandleFeatures, emptyCandle } from "./features/candle-features";
import { emptyOrderBook } from "./features/orderbook-features";
import { emptyTicker } from "./features/ticker-features";
import { emptyTrade } from "./features/trade-features";

enum FeatureIndex {
	CandleClose = 0,
	CandleVolume = 1,
	CandleReturnRatio = 2,
	CandlePositionRatio = 3,
	CandleRangeRatio = 4,
	CandleOpen = 5,
	CandleHigh = 6,
	CandleLow = 7,
	CandleVolumeRatio = 8,
	OrderBookAvgBid = 9,
	OrderBookAvgAsk = 10,
	OrderBookSpreadRatio = 11,
	OrderBookImbalance = 12,
	BookTickerBid = 13,
	BookTickerAsk = 14,
	BookTickerSpreadRatio = 15,
	TradeAvgPrice = 16,
	TradeTotalQty = 17,
	TradeBuyRatio = 18,
	TickerPriceChange = 19,
	TickerVolume = 20,
	TickerDailyRange = 21,
	PriceSnapshot = 22,
}

export const FEATURE_DIM = 32;

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

const FeatureCount = 23;
const SlidingWindowSize = 8;
const SlidingWindowOffset = FeatureCount;
const BiasIndex = FEATURE_DIM - 1;

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
			this._decode(data);
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector {
		return new FeatureVector(data);
	}

	toFloat32Array(): Float32Array {
		return this._encode();
	}

	slidingWindow(): Float32Array {
		return this._slidingWindow;
	}

	private _encode(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		const sw = this._slidingWindow;

		arr[FeatureIndex.CandleClose] = this.candle.close;
		arr[FeatureIndex.CandleVolume] = this.candle.volume;
		arr[FeatureIndex.CandleReturnRatio] = this.candle.returnRatio;
		arr[FeatureIndex.CandlePositionRatio] = this.candle.positionRatio;
		arr[FeatureIndex.CandleRangeRatio] = this.candle.rangeRatio;
		arr[FeatureIndex.CandleOpen] = this.candle.open;
		arr[FeatureIndex.CandleHigh] = this.candle.high;
		arr[FeatureIndex.CandleLow] = this.candle.low;
		arr[FeatureIndex.CandleVolumeRatio] = this.candle.volumeRatio;
		arr[FeatureIndex.OrderBookAvgBid] = this.orderBook.avgBid;
		arr[FeatureIndex.OrderBookAvgAsk] = this.orderBook.avgAsk;
		arr[FeatureIndex.OrderBookSpreadRatio] = this.orderBook.spreadRatio;
		arr[FeatureIndex.OrderBookImbalance] = this.orderBook.imbalance;
		arr[FeatureIndex.BookTickerBid] = this.bookTicker.bid;
		arr[FeatureIndex.BookTickerAsk] = this.bookTicker.ask;
		arr[FeatureIndex.BookTickerSpreadRatio] = this.bookTicker.spreadRatio;
		arr[FeatureIndex.TradeAvgPrice] = this.trade.avgPrice;
		arr[FeatureIndex.TradeTotalQty] = this.trade.totalQty;
		arr[FeatureIndex.TradeBuyRatio] = this.trade.buyRatio;
		arr[FeatureIndex.TickerPriceChange] = this.ticker.priceChange;
		arr[FeatureIndex.TickerVolume] = this.ticker.volume;
		arr[FeatureIndex.TickerDailyRange] = this.ticker.dailyRange;
		arr[FeatureIndex.PriceSnapshot] = this.priceSnapshot;

		for (let i = 0; i < SlidingWindowSize; i++) {
			arr[SlidingWindowOffset + i] = sw[i];
		}
		arr[BiasIndex] = this.bias;

		return arr;
	}

	private _decode(data: Float32Array): void {
		const sw = this._slidingWindow;

		this.candle.close = data[FeatureIndex.CandleClose] as Price;
		this.candle.volume = data[FeatureIndex.CandleVolume] as Volume;
		this.candle.returnRatio = data[FeatureIndex.CandleReturnRatio] as Ratio;
		this.candle.positionRatio = data[FeatureIndex.CandlePositionRatio] as Ratio;
		this.candle.rangeRatio = data[FeatureIndex.CandleRangeRatio] as Ratio;
		this.candle.open = data[FeatureIndex.CandleOpen] as Price;
		this.candle.high = data[FeatureIndex.CandleHigh] as Price;
		this.candle.low = data[FeatureIndex.CandleLow] as Price;
		this.candle.volumeRatio = data[FeatureIndex.CandleVolumeRatio] as Ratio;
		this.orderBook.avgBid = data[FeatureIndex.OrderBookAvgBid] as Price;
		this.orderBook.avgAsk = data[FeatureIndex.OrderBookAvgAsk] as Price;
		this.orderBook.spreadRatio = data[
			FeatureIndex.OrderBookSpreadRatio
		] as Ratio;
		this.orderBook.imbalance = data[FeatureIndex.OrderBookImbalance] as Ratio;
		this.bookTicker.bid = data[FeatureIndex.BookTickerBid] as Price;
		this.bookTicker.ask = data[FeatureIndex.BookTickerAsk] as Price;
		this.bookTicker.spreadRatio = data[
			FeatureIndex.BookTickerSpreadRatio
		] as Ratio;
		this.trade.avgPrice = data[FeatureIndex.TradeAvgPrice] as Price;
		this.trade.totalQty = data[FeatureIndex.TradeTotalQty] as Volume;
		this.trade.buyRatio = data[FeatureIndex.TradeBuyRatio] as Ratio;
		this.ticker.priceChange = data[FeatureIndex.TickerPriceChange] as Ratio;
		this.ticker.volume = data[FeatureIndex.TickerVolume] as Volume;
		this.ticker.dailyRange = data[FeatureIndex.TickerDailyRange] as Ratio;
		this.priceSnapshot = data[FeatureIndex.PriceSnapshot] as Price;

		for (let i = 0; i < SlidingWindowSize; i++) {
			sw[i] = data[SlidingWindowOffset + i] ?? 0;
		}
		this.bias = data[BiasIndex] ?? 0;
	}
}
