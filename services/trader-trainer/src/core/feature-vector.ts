export const FEATURE_DIM = 32;
const SLIDING_WINDOW_SIZE = 8;
const FEATURE_COUNT = 23;

export enum FeatureIndex {
	Close = 0,
	Volume = 1,
	ReturnRatio = 2,
	PositionRatio = 3,
	RangeRatio = 4,
	Open = 5,
	High = 6,
	Low = 7,
	VolumeRatio = 8,
	AvgBid = 9,
	AvgAsk = 10,
	SpreadRatioOb = 11,
	Imbalance = 12,
	Bid = 13,
	Ask = 14,
	SpreadRatioBt = 15,
	AvgPrice = 16,
	TotalQty = 17,
	BuyRatio = 18,
	PriceChange = 19,
	TickerVolume = 20,
	DailyRange = 21,
	PriceSnapshot = 22,
}

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
	return { close: 0, volume: 0, returnRatio: 0, positionRatio: 0, rangeRatio: 0, open: 0, high: 0, low: 0, volumeRatio: 0 };
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
	private readonly _slidingWindow: Float32Array;
	bias = 0;

	constructor(data?: Float32Array) {
		this.candle = emptyCandle();
		this.orderBook = emptyOrderBook();
		this.bookTicker = emptyBookTicker();
		this.trade = emptyTrade();
		this.ticker = emptyTicker();
		this._slidingWindow = new Float32Array(SLIDING_WINDOW_SIZE);
		if (data instanceof Float32Array) {
			this.candle.close = data[FeatureIndex.Close] ?? 0;
			this.candle.volume = data[FeatureIndex.Volume] ?? 0;
			this.candle.returnRatio = data[FeatureIndex.ReturnRatio] ?? 0;
			this.candle.positionRatio = data[FeatureIndex.PositionRatio] ?? 0;
			this.candle.rangeRatio = data[FeatureIndex.RangeRatio] ?? 0;
			this.candle.open = data[FeatureIndex.Open] ?? 0;
			this.candle.high = data[FeatureIndex.High] ?? 0;
			this.candle.low = data[FeatureIndex.Low] ?? 0;
			this.candle.volumeRatio = data[FeatureIndex.VolumeRatio] ?? 0;
			this.orderBook.avgBid = data[FeatureIndex.AvgBid] ?? 0;
			this.orderBook.avgAsk = data[FeatureIndex.AvgAsk] ?? 0;
			this.orderBook.spreadRatio = data[FeatureIndex.SpreadRatioOb] ?? 0;
			this.orderBook.imbalance = data[FeatureIndex.Imbalance] ?? 0;
			this.bookTicker.bid = data[FeatureIndex.Bid] ?? 0;
			this.bookTicker.ask = data[FeatureIndex.Ask] ?? 0;
			this.bookTicker.spreadRatio = data[FeatureIndex.SpreadRatioBt] ?? 0;
			this.trade.avgPrice = data[FeatureIndex.AvgPrice] ?? 0;
			this.trade.totalQty = data[FeatureIndex.TotalQty] ?? 0;
			this.trade.buyRatio = data[FeatureIndex.BuyRatio] ?? 0;
			this.ticker.priceChange = data[FeatureIndex.PriceChange] ?? 0;
			this.ticker.volume = data[FeatureIndex.TickerVolume] ?? 0;
			this.ticker.dailyRange = data[FeatureIndex.DailyRange] ?? 0;
			this.priceSnapshot = data[FeatureIndex.PriceSnapshot] ?? 0;
			for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { this._slidingWindow[i] = data[FEATURE_COUNT + i] ?? 0; }
			this.bias = data[FEATURE_DIM - 1] ?? 0;
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector { return new FeatureVector(data); }

	toFloat32Array(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		arr[FeatureIndex.Close] = this.candle.close;
		arr[FeatureIndex.Volume] = this.candle.volume;
		arr[FeatureIndex.ReturnRatio] = this.candle.returnRatio;
		arr[FeatureIndex.PositionRatio] = this.candle.positionRatio;
		arr[FeatureIndex.RangeRatio] = this.candle.rangeRatio;
		arr[FeatureIndex.Open] = this.candle.open;
		arr[FeatureIndex.High] = this.candle.high;
		arr[FeatureIndex.Low] = this.candle.low;
		arr[FeatureIndex.VolumeRatio] = this.candle.volumeRatio;
		arr[FeatureIndex.AvgBid] = this.orderBook.avgBid;
		arr[FeatureIndex.AvgAsk] = this.orderBook.avgAsk;
		arr[FeatureIndex.SpreadRatioOb] = this.orderBook.spreadRatio;
		arr[FeatureIndex.Imbalance] = this.orderBook.imbalance;
		arr[FeatureIndex.Bid] = this.bookTicker.bid;
		arr[FeatureIndex.Ask] = this.bookTicker.ask;
		arr[FeatureIndex.SpreadRatioBt] = this.bookTicker.spreadRatio;
		arr[FeatureIndex.AvgPrice] = this.trade.avgPrice;
		arr[FeatureIndex.TotalQty] = this.trade.totalQty;
		arr[FeatureIndex.BuyRatio] = this.trade.buyRatio;
		arr[FeatureIndex.PriceChange] = this.ticker.priceChange;
		arr[FeatureIndex.TickerVolume] = this.ticker.volume;
		arr[FeatureIndex.DailyRange] = this.ticker.dailyRange;
		arr[FeatureIndex.PriceSnapshot] = this.priceSnapshot;
		for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { arr[FEATURE_COUNT + i] = this._slidingWindow[i]; }
		arr[FEATURE_DIM - 1] = this.bias;
		return arr;
	}

	slidingWindow(): Float32Array { return this._slidingWindow; }
}
