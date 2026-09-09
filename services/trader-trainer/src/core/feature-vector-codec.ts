import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";
import type { FeatureVector } from "./feature-vector";

export const FEATURE_DIM = 32;
export const SlidingWindowSize = 8;

const BiasIndex = FEATURE_DIM - 1;

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

interface FeatureFieldDef {
	readonly index: FeatureIndex;
	readonly read: (fv: FeatureVector) => number;
	readonly write: (fv: FeatureVector, value: number) => void;
}

const FEATURE_FIELDS: FeatureFieldDef[] = [
	{
		index: FeatureIndex.CandleClose,
		read: (fv) => fv.candle.close,
		write: (fv, value) => {
			fv.candle.close = value as Price;
		},
	},
	{
		index: FeatureIndex.CandleVolume,
		read: (fv) => fv.candle.volume,
		write: (fv, value) => {
			fv.candle.volume = value as Volume;
		},
	},
	{
		index: FeatureIndex.CandleReturnRatio,
		read: (fv) => fv.candle.returnRatio,
		write: (fv, value) => {
			fv.candle.returnRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.CandlePositionRatio,
		read: (fv) => fv.candle.positionRatio,
		write: (fv, value) => {
			fv.candle.positionRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.CandleRangeRatio,
		read: (fv) => fv.candle.rangeRatio,
		write: (fv, value) => {
			fv.candle.rangeRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.CandleOpen,
		read: (fv) => fv.candle.open,
		write: (fv, value) => {
			fv.candle.open = value as Price;
		},
	},
	{
		index: FeatureIndex.CandleHigh,
		read: (fv) => fv.candle.high,
		write: (fv, value) => {
			fv.candle.high = value as Price;
		},
	},
	{
		index: FeatureIndex.CandleLow,
		read: (fv) => fv.candle.low,
		write: (fv, value) => {
			fv.candle.low = value as Price;
		},
	},
	{
		index: FeatureIndex.CandleVolumeRatio,
		read: (fv) => fv.candle.volumeRatio,
		write: (fv, value) => {
			fv.candle.volumeRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.OrderBookAvgBid,
		read: (fv) => fv.orderBook.avgBid,
		write: (fv, value) => {
			fv.orderBook.avgBid = value as Price;
		},
	},
	{
		index: FeatureIndex.OrderBookAvgAsk,
		read: (fv) => fv.orderBook.avgAsk,
		write: (fv, value) => {
			fv.orderBook.avgAsk = value as Price;
		},
	},
	{
		index: FeatureIndex.OrderBookSpreadRatio,
		read: (fv) => fv.orderBook.spreadRatio,
		write: (fv, value) => {
			fv.orderBook.spreadRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.OrderBookImbalance,
		read: (fv) => fv.orderBook.imbalance,
		write: (fv, value) => {
			fv.orderBook.imbalance = value as Ratio;
		},
	},
	{
		index: FeatureIndex.BookTickerBid,
		read: (fv) => fv.bookTicker.bid,
		write: (fv, value) => {
			fv.bookTicker.bid = value as Price;
		},
	},
	{
		index: FeatureIndex.BookTickerAsk,
		read: (fv) => fv.bookTicker.ask,
		write: (fv, value) => {
			fv.bookTicker.ask = value as Price;
		},
	},
	{
		index: FeatureIndex.BookTickerSpreadRatio,
		read: (fv) => fv.bookTicker.spreadRatio,
		write: (fv, value) => {
			fv.bookTicker.spreadRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.TradeAvgPrice,
		read: (fv) => fv.trade.avgPrice,
		write: (fv, value) => {
			fv.trade.avgPrice = value as Price;
		},
	},
	{
		index: FeatureIndex.TradeTotalQty,
		read: (fv) => fv.trade.totalQty,
		write: (fv, value) => {
			fv.trade.totalQty = value as Volume;
		},
	},
	{
		index: FeatureIndex.TradeBuyRatio,
		read: (fv) => fv.trade.buyRatio,
		write: (fv, value) => {
			fv.trade.buyRatio = value as Ratio;
		},
	},
	{
		index: FeatureIndex.TickerPriceChange,
		read: (fv) => fv.ticker.priceChange,
		write: (fv, value) => {
			fv.ticker.priceChange = value as Ratio;
		},
	},
	{
		index: FeatureIndex.TickerVolume,
		read: (fv) => fv.ticker.volume,
		write: (fv, value) => {
			fv.ticker.volume = value as Volume;
		},
	},
	{
		index: FeatureIndex.TickerDailyRange,
		read: (fv) => fv.ticker.dailyRange,
		write: (fv, value) => {
			fv.ticker.dailyRange = value as Ratio;
		},
	},
	{
		index: FeatureIndex.PriceSnapshot,
		read: (fv) => fv.priceSnapshot,
		write: (fv, value) => {
			fv.priceSnapshot = value as Price;
		},
	},
];

const FeatureCount = FEATURE_FIELDS.length;
const SlidingWindowOffset = FeatureCount;

export function encode(fv: FeatureVector): Float32Array {
	const arr = new Float32Array(FEATURE_DIM);
	const sw = fv.slidingWindow();

	for (const field of FEATURE_FIELDS) {
		arr[field.index] = field.read(fv);
	}

	for (let i = 0; i < SlidingWindowSize; i++) {
		arr[SlidingWindowOffset + i] = sw[i];
	}
	arr[BiasIndex] = fv.bias;

	return arr;
}

export function decodeInto(fv: FeatureVector, data: Float32Array): void {
	const sw = fv.slidingWindow();

	for (const field of FEATURE_FIELDS) {
		field.write(fv, data[field.index]);
	}

	for (let i = 0; i < SlidingWindowSize; i++) {
		sw[i] = data[SlidingWindowOffset + i] ?? 0;
	}
	fv.bias = data[BiasIndex] ?? 0;
}
