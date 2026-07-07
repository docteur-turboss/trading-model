export const FEATURE_DIM = 32;
const SLIDING_WINDOW_SIZE = 8;

export const FEATURE_INDEX = {
	Close: 0,
	Volume: 1,
	ReturnRatio: 2,
	PositionRatio: 3,
	RangeRatio: 4,
	Open: 5,
	High: 6,
	Low: 7,
	VolumeRatio: 8,
	AvgBid: 9,
	AvgAsk: 10,
	SpreadRatioOb: 11,
	Imbalance: 12,
	Bid: 13,
	Ask: 14,
	SpreadRatioBt: 15,
	AvgPrice: 16,
	TotalQty: 17,
	BuyRatio: 18,
	PriceChange: 19,
	TickerVolume: 20,
	DailyRange: 21,
	PriceSnapshot: 22,
} as const;

const FEATURE_COUNT = Object.keys(FEATURE_INDEX).length;

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
			this.candle.close = data[FEATURE_INDEX.Close] ?? 0;
			this.candle.volume = data[FEATURE_INDEX.Volume] ?? 0;
			this.candle.returnRatio = data[FEATURE_INDEX.ReturnRatio] ?? 0;
			this.candle.positionRatio = data[FEATURE_INDEX.PositionRatio] ?? 0;
			this.candle.rangeRatio = data[FEATURE_INDEX.RangeRatio] ?? 0;
			this.candle.open = data[FEATURE_INDEX.Open] ?? 0;
			this.candle.high = data[FEATURE_INDEX.High] ?? 0;
			this.candle.low = data[FEATURE_INDEX.Low] ?? 0;
			this.candle.volumeRatio = data[FEATURE_INDEX.VolumeRatio] ?? 0;
			this.orderBook.avgBid = data[FEATURE_INDEX.AvgBid] ?? 0;
			this.orderBook.avgAsk = data[FEATURE_INDEX.AvgAsk] ?? 0;
			this.orderBook.spreadRatio = data[FEATURE_INDEX.SpreadRatioOb] ?? 0;
			this.orderBook.imbalance = data[FEATURE_INDEX.Imbalance] ?? 0;
			this.bookTicker.bid = data[FEATURE_INDEX.Bid] ?? 0;
			this.bookTicker.ask = data[FEATURE_INDEX.Ask] ?? 0;
			this.bookTicker.spreadRatio = data[FEATURE_INDEX.SpreadRatioBt] ?? 0;
			this.trade.avgPrice = data[FEATURE_INDEX.AvgPrice] ?? 0;
			this.trade.totalQty = data[FEATURE_INDEX.TotalQty] ?? 0;
			this.trade.buyRatio = data[FEATURE_INDEX.BuyRatio] ?? 0;
			this.ticker.priceChange = data[FEATURE_INDEX.PriceChange] ?? 0;
			this.ticker.volume = data[FEATURE_INDEX.TickerVolume] ?? 0;
			this.ticker.dailyRange = data[FEATURE_INDEX.DailyRange] ?? 0;
			this.priceSnapshot = data[FEATURE_INDEX.PriceSnapshot] ?? 0;
			for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { this._slidingWindow[i] = data[FEATURE_COUNT + i] ?? 0; }
			this.bias = data[FEATURE_DIM - 1] ?? 0;
		}
	}

	static fromFloat32Array(data: Float32Array): FeatureVector { return new FeatureVector(data); }

	toFloat32Array(): Float32Array {
		const arr = new Float32Array(FEATURE_DIM);
		arr[FEATURE_INDEX.Close] = this.candle.close;
		arr[FEATURE_INDEX.Volume] = this.candle.volume;
		arr[FEATURE_INDEX.ReturnRatio] = this.candle.returnRatio;
		arr[FEATURE_INDEX.PositionRatio] = this.candle.positionRatio;
		arr[FEATURE_INDEX.RangeRatio] = this.candle.rangeRatio;
		arr[FEATURE_INDEX.Open] = this.candle.open;
		arr[FEATURE_INDEX.High] = this.candle.high;
		arr[FEATURE_INDEX.Low] = this.candle.low;
		arr[FEATURE_INDEX.VolumeRatio] = this.candle.volumeRatio;
		arr[FEATURE_INDEX.AvgBid] = this.orderBook.avgBid;
		arr[FEATURE_INDEX.AvgAsk] = this.orderBook.avgAsk;
		arr[FEATURE_INDEX.SpreadRatioOb] = this.orderBook.spreadRatio;
		arr[FEATURE_INDEX.Imbalance] = this.orderBook.imbalance;
		arr[FEATURE_INDEX.Bid] = this.bookTicker.bid;
		arr[FEATURE_INDEX.Ask] = this.bookTicker.ask;
		arr[FEATURE_INDEX.SpreadRatioBt] = this.bookTicker.spreadRatio;
		arr[FEATURE_INDEX.AvgPrice] = this.trade.avgPrice;
		arr[FEATURE_INDEX.TotalQty] = this.trade.totalQty;
		arr[FEATURE_INDEX.BuyRatio] = this.trade.buyRatio;
		arr[FEATURE_INDEX.PriceChange] = this.ticker.priceChange;
		arr[FEATURE_INDEX.TickerVolume] = this.ticker.volume;
		arr[FEATURE_INDEX.DailyRange] = this.ticker.dailyRange;
		arr[FEATURE_INDEX.PriceSnapshot] = this.priceSnapshot;
		for (let i = 0; i < SLIDING_WINDOW_SIZE; i++) { arr[FEATURE_COUNT + i] = this._slidingWindow[i]; }
		arr[FEATURE_DIM - 1] = this.bias;
		return arr;
	}

	slidingWindow(): Float32Array { return this._slidingWindow; }
}
