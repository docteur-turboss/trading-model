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

	get candleClose(): number { return this.buffer[FeatureIndex.CandleClose]; }
	set candleClose(v: number) { this.buffer[FeatureIndex.CandleClose] = v; }

	get candleVolume(): number { return this.buffer[FeatureIndex.CandleVolume]; }
	set candleVolume(v: number) { this.buffer[FeatureIndex.CandleVolume] = v; }

	get candleReturnRatio(): number { return this.buffer[FeatureIndex.CandleReturnRatio]; }
	set candleReturnRatio(v: number) { this.buffer[FeatureIndex.CandleReturnRatio] = v; }

	get candlePositionRatio(): number { return this.buffer[FeatureIndex.CandlePositionRatio]; }
	set candlePositionRatio(v: number) { this.buffer[FeatureIndex.CandlePositionRatio] = v; }

	get candleRangeRatio(): number { return this.buffer[FeatureIndex.CandleRangeRatio]; }
	set candleRangeRatio(v: number) { this.buffer[FeatureIndex.CandleRangeRatio] = v; }

	get candleOpen(): number { return this.buffer[FeatureIndex.CandleOpen]; }
	set candleOpen(v: number) { this.buffer[FeatureIndex.CandleOpen] = v; }

	get candleHigh(): number { return this.buffer[FeatureIndex.CandleHigh]; }
	set candleHigh(v: number) { this.buffer[FeatureIndex.CandleHigh] = v; }

	get candleLow(): number { return this.buffer[FeatureIndex.CandleLow]; }
	set candleLow(v: number) { this.buffer[FeatureIndex.CandleLow] = v; }

	get candleVolumeRatio(): number { return this.buffer[FeatureIndex.CandleVolumeRatio]; }
	set candleVolumeRatio(v: number) { this.buffer[FeatureIndex.CandleVolumeRatio] = v; }

	get orderBookAvgBid(): number { return this.buffer[FeatureIndex.OrderBookAvgBid]; }
	set orderBookAvgBid(v: number) { this.buffer[FeatureIndex.OrderBookAvgBid] = v; }

	get orderBookAvgAsk(): number { return this.buffer[FeatureIndex.OrderBookAvgAsk]; }
	set orderBookAvgAsk(v: number) { this.buffer[FeatureIndex.OrderBookAvgAsk] = v; }

	get orderBookSpreadRatio(): number { return this.buffer[FeatureIndex.OrderBookSpreadRatio]; }
	set orderBookSpreadRatio(v: number) { this.buffer[FeatureIndex.OrderBookSpreadRatio] = v; }

	get orderBookImbalance(): number { return this.buffer[FeatureIndex.OrderBookImbalance]; }
	set orderBookImbalance(v: number) { this.buffer[FeatureIndex.OrderBookImbalance] = v; }

	get bookTickerBid(): number { return this.buffer[FeatureIndex.BookTickerBid]; }
	set bookTickerBid(v: number) { this.buffer[FeatureIndex.BookTickerBid] = v; }

	get bookTickerAsk(): number { return this.buffer[FeatureIndex.BookTickerAsk]; }
	set bookTickerAsk(v: number) { this.buffer[FeatureIndex.BookTickerAsk] = v; }

	get bookTickerSpreadRatio(): number { return this.buffer[FeatureIndex.BookTickerSpreadRatio]; }
	set bookTickerSpreadRatio(v: number) { this.buffer[FeatureIndex.BookTickerSpreadRatio] = v; }

	get tradeAvgPrice(): number { return this.buffer[FeatureIndex.TradeAvgPrice]; }
	set tradeAvgPrice(v: number) { this.buffer[FeatureIndex.TradeAvgPrice] = v; }

	get tradeTotalQty(): number { return this.buffer[FeatureIndex.TradeTotalQty]; }
	set tradeTotalQty(v: number) { this.buffer[FeatureIndex.TradeTotalQty] = v; }

	get tradeBuyRatio(): number { return this.buffer[FeatureIndex.TradeBuyRatio]; }
	set tradeBuyRatio(v: number) { this.buffer[FeatureIndex.TradeBuyRatio] = v; }

	get tickerPriceChange(): number { return this.buffer[FeatureIndex.TickerPriceChange]; }
	set tickerPriceChange(v: number) { this.buffer[FeatureIndex.TickerPriceChange] = v; }

	get tickerVolume(): number { return this.buffer[FeatureIndex.TickerVolume]; }
	set tickerVolume(v: number) { this.buffer[FeatureIndex.TickerVolume] = v; }

	get tickerDailyRange(): number { return this.buffer[FeatureIndex.TickerDailyRange]; }
	set tickerDailyRange(v: number) { this.buffer[FeatureIndex.TickerDailyRange] = v; }

	get priceSnapshot(): number { return this.buffer[FeatureIndex.PriceSnapshot]; }
	set priceSnapshot(v: number) { this.buffer[FeatureIndex.PriceSnapshot] = v; }

	get bias(): number { return this.buffer[FeatureIndex.Bias]; }
	set bias(v: number) { this.buffer[FeatureIndex.Bias] = v; }

	/** Returns a view into the 8-element sliding window. */
	slidingWindow(): Float32Array {
		return this.buffer.subarray(FeatureIndex.SlidingWindowStart, FeatureIndex.SlidingWindowEnd + 1);
	}
}
