import { FeatureIndex } from "./feature-indices";

export const FEATURE_DIM = 32;

export class FeatureVector {
	readonly buffer: Float32Array;

	constructor(data?: Float32Array | number) {
		if (typeof data === "number") {
			this.buffer = new Float32Array(data);
		} else {
			this.buffer = data ?? new Float32Array(FEATURE_DIM);
		}
	}

	get candleClose(): Price { return this.buffer[FeatureIndex.CandleClose] as Price; }
	set candleClose(v: Price) { this.buffer[FeatureIndex.CandleClose] = v; }

	get candleVolume(): Volume { return this.buffer[FeatureIndex.CandleVolume] as Volume; }
	set candleVolume(v: Volume) { this.buffer[FeatureIndex.CandleVolume] = v; }

	get candleReturnRatio(): number { return this.buffer[FeatureIndex.CandleReturnRatio]; }
	set candleReturnRatio(v: number) { this.buffer[FeatureIndex.CandleReturnRatio] = v; }

	get candlePositionRatio(): number { return this.buffer[FeatureIndex.CandlePositionRatio]; }
	set candlePositionRatio(v: number) { this.buffer[FeatureIndex.CandlePositionRatio] = v; }

	get candleRangeRatio(): number { return this.buffer[FeatureIndex.CandleRangeRatio]; }
	set candleRangeRatio(v: number) { this.buffer[FeatureIndex.CandleRangeRatio] = v; }

	get candleOpen(): Price { return this.buffer[FeatureIndex.CandleOpen] as Price; }
	set candleOpen(v: Price) { this.buffer[FeatureIndex.CandleOpen] = v; }

	get candleHigh(): Price { return this.buffer[FeatureIndex.CandleHigh] as Price; }
	set candleHigh(v: Price) { this.buffer[FeatureIndex.CandleHigh] = v; }

	get candleLow(): Price { return this.buffer[FeatureIndex.CandleLow] as Price; }
	set candleLow(v: Price) { this.buffer[FeatureIndex.CandleLow] = v; }

	get candleVolumeRatio(): number { return this.buffer[FeatureIndex.CandleVolumeRatio]; }
	set candleVolumeRatio(v: number) { this.buffer[FeatureIndex.CandleVolumeRatio] = v; }

	get orderBookAvgBid(): Price { return this.buffer[FeatureIndex.OrderBookAvgBid] as Price; }
	set orderBookAvgBid(v: Price) { this.buffer[FeatureIndex.OrderBookAvgBid] = v; }

	get orderBookAvgAsk(): Price { return this.buffer[FeatureIndex.OrderBookAvgAsk] as Price; }
	set orderBookAvgAsk(v: Price) { this.buffer[FeatureIndex.OrderBookAvgAsk] = v; }

	get orderBookSpreadRatio(): number { return this.buffer[FeatureIndex.OrderBookSpreadRatio]; }
	set orderBookSpreadRatio(v: number) { this.buffer[FeatureIndex.OrderBookSpreadRatio] = v; }

	get orderBookImbalance(): Volume { return this.buffer[FeatureIndex.OrderBookImbalance] as Volume; }
	set orderBookImbalance(v: Volume) { this.buffer[FeatureIndex.OrderBookImbalance] = v; }

	get bookTickerBid(): Price { return this.buffer[FeatureIndex.BookTickerBid] as Price; }
	set bookTickerBid(v: Price) { this.buffer[FeatureIndex.BookTickerBid] = v; }

	get bookTickerAsk(): Price { return this.buffer[FeatureIndex.BookTickerAsk] as Price; }
	set bookTickerAsk(v: Price) { this.buffer[FeatureIndex.BookTickerAsk] = v; }

	get bookTickerSpreadRatio(): number { return this.buffer[FeatureIndex.BookTickerSpreadRatio]; }
	set bookTickerSpreadRatio(v: number) { this.buffer[FeatureIndex.BookTickerSpreadRatio] = v; }

	get tradeAvgPrice(): Price { return this.buffer[FeatureIndex.TradeAvgPrice] as Price; }
	set tradeAvgPrice(v: Price) { this.buffer[FeatureIndex.TradeAvgPrice] = v; }

	get tradeTotalQty(): Volume { return this.buffer[FeatureIndex.TradeTotalQty] as Volume; }
	set tradeTotalQty(v: Volume) { this.buffer[FeatureIndex.TradeTotalQty] = v; }

	get tradeBuyRatio(): number { return this.buffer[FeatureIndex.TradeBuyRatio]; }
	set tradeBuyRatio(v: number) { this.buffer[FeatureIndex.TradeBuyRatio] = v; }

	get tickerPriceChange(): Price { return this.buffer[FeatureIndex.TickerPriceChange] as Price; }
	set tickerPriceChange(v: Price) { this.buffer[FeatureIndex.TickerPriceChange] = v; }

	get tickerVolume(): Volume { return this.buffer[FeatureIndex.TickerVolume] as Volume; }
	set tickerVolume(v: Volume) { this.buffer[FeatureIndex.TickerVolume] = v; }

	get tickerDailyRange(): number { return this.buffer[FeatureIndex.TickerDailyRange]; }
	set tickerDailyRange(v: number) { this.buffer[FeatureIndex.TickerDailyRange] = v; }

	get priceSnapshot(): Price { return this.buffer[FeatureIndex.PriceSnapshot] as Price; }
	set priceSnapshot(v: Price) { this.buffer[FeatureIndex.PriceSnapshot] = v; }

	get bias(): Percentage { return this.buffer[FeatureIndex.Bias] as Percentage; }
	set bias(v: Percentage) { this.buffer[FeatureIndex.Bias] = v; }

	/** Returns a view into the 8-element sliding window. */
	slidingWindow(): Float32Array {
		return this.buffer.subarray(FeatureIndex.SlidingWindowStart, FeatureIndex.SlidingWindowEnd + 1);
	}
}
