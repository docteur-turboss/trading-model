import { FeatureIndex } from "./feature-indices";

export const FEATURE_DIM = 32;

export class FeatureVector {
	private readonly _buffer: Float32Array;

	constructor(data?: Float32Array | number) {
		if (typeof data === "number") {
			this._buffer = new Float32Array(data);
		} else {
			this._buffer = data ?? new Float32Array(FEATURE_DIM);
		}
	}

	toFloat32Array(): Float32Array {
		return this._buffer;
	}

	slidingWindow(): Float32Array {
		return this._buffer.subarray(
			FeatureIndex.SlidingWindowStart,
			FeatureIndex.SlidingWindowEnd + 1,
		);
	}

	get candleClose(): number { return this._buffer[FeatureIndex.CandleClose]; }
	set candleClose(v: number) { this._buffer[FeatureIndex.CandleClose] = v; }
	get candleVolume(): number { return this._buffer[FeatureIndex.CandleVolume]; }
	set candleVolume(v: number) { this._buffer[FeatureIndex.CandleVolume] = v; }
	get candleReturnRatio(): number { return this._buffer[FeatureIndex.CandleReturnRatio]; }
	set candleReturnRatio(v: number) { this._buffer[FeatureIndex.CandleReturnRatio] = v; }
	get candlePositionRatio(): number { return this._buffer[FeatureIndex.CandlePositionRatio]; }
	set candlePositionRatio(v: number) { this._buffer[FeatureIndex.CandlePositionRatio] = v; }
	get candleRangeRatio(): number { return this._buffer[FeatureIndex.CandleRangeRatio]; }
	set candleRangeRatio(v: number) { this._buffer[FeatureIndex.CandleRangeRatio] = v; }
	get candleOpen(): number { return this._buffer[FeatureIndex.CandleOpen]; }
	set candleOpen(v: number) { this._buffer[FeatureIndex.CandleOpen] = v; }
	get candleHigh(): number { return this._buffer[FeatureIndex.CandleHigh]; }
	set candleHigh(v: number) { this._buffer[FeatureIndex.CandleHigh] = v; }
	get candleLow(): number { return this._buffer[FeatureIndex.CandleLow]; }
	set candleLow(v: number) { this._buffer[FeatureIndex.CandleLow] = v; }
	get candleVolumeRatio(): number { return this._buffer[FeatureIndex.CandleVolumeRatio]; }
	set candleVolumeRatio(v: number) { this._buffer[FeatureIndex.CandleVolumeRatio] = v; }
	get orderBookAvgBid(): number { return this._buffer[FeatureIndex.OrderBookAvgBid]; }
	set orderBookAvgBid(v: number) { this._buffer[FeatureIndex.OrderBookAvgBid] = v; }
	get orderBookAvgAsk(): number { return this._buffer[FeatureIndex.OrderBookAvgAsk]; }
	set orderBookAvgAsk(v: number) { this._buffer[FeatureIndex.OrderBookAvgAsk] = v; }
	get orderBookSpreadRatio(): number { return this._buffer[FeatureIndex.OrderBookSpreadRatio]; }
	set orderBookSpreadRatio(v: number) { this._buffer[FeatureIndex.OrderBookSpreadRatio] = v; }
	get orderBookImbalance(): number { return this._buffer[FeatureIndex.OrderBookImbalance]; }
	set orderBookImbalance(v: number) { this._buffer[FeatureIndex.OrderBookImbalance] = v; }
	get bookTickerBid(): number { return this._buffer[FeatureIndex.BookTickerBid]; }
	set bookTickerBid(v: number) { this._buffer[FeatureIndex.BookTickerBid] = v; }
	get bookTickerAsk(): number { return this._buffer[FeatureIndex.BookTickerAsk]; }
	set bookTickerAsk(v: number) { this._buffer[FeatureIndex.BookTickerAsk] = v; }
	get bookTickerSpreadRatio(): number { return this._buffer[FeatureIndex.BookTickerSpreadRatio]; }
	set bookTickerSpreadRatio(v: number) { this._buffer[FeatureIndex.BookTickerSpreadRatio] = v; }
	get tradeAvgPrice(): number { return this._buffer[FeatureIndex.TradeAvgPrice]; }
	set tradeAvgPrice(v: number) { this._buffer[FeatureIndex.TradeAvgPrice] = v; }
	get tradeTotalQty(): number { return this._buffer[FeatureIndex.TradeTotalQty]; }
	set tradeTotalQty(v: number) { this._buffer[FeatureIndex.TradeTotalQty] = v; }
	get tradeBuyRatio(): number { return this._buffer[FeatureIndex.TradeBuyRatio]; }
	set tradeBuyRatio(v: number) { this._buffer[FeatureIndex.TradeBuyRatio] = v; }
	get tickerPriceChange(): number { return this._buffer[FeatureIndex.TickerPriceChange]; }
	set tickerPriceChange(v: number) { this._buffer[FeatureIndex.TickerPriceChange] = v; }
	get tickerVolume(): number { return this._buffer[FeatureIndex.TickerVolume]; }
	set tickerVolume(v: number) { this._buffer[FeatureIndex.TickerVolume] = v; }
	get tickerDailyRange(): number { return this._buffer[FeatureIndex.TickerDailyRange]; }
	set tickerDailyRange(v: number) { this._buffer[FeatureIndex.TickerDailyRange] = v; }
	get priceSnapshot(): number { return this._buffer[FeatureIndex.PriceSnapshot]; }
	set priceSnapshot(v: number) { this._buffer[FeatureIndex.PriceSnapshot] = v; }
	get bias(): number { return this._buffer[FeatureIndex.Bias]; }
	set bias(v: number) { this._buffer[FeatureIndex.Bias] = v; }
}
