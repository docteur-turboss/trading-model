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

	get candleClose(): number { return this.buffer[0]; }
	set candleClose(v: number) { this.buffer[0] = v; }

	get candleVolume(): number { return this.buffer[1]; }
	set candleVolume(v: number) { this.buffer[1] = v; }

	get candleReturnRatio(): number { return this.buffer[2]; }
	set candleReturnRatio(v: number) { this.buffer[2] = v; }

	get candlePositionRatio(): number { return this.buffer[3]; }
	set candlePositionRatio(v: number) { this.buffer[3] = v; }

	get candleRangeRatio(): number { return this.buffer[4]; }
	set candleRangeRatio(v: number) { this.buffer[4] = v; }

	get candleOpen(): number { return this.buffer[5]; }
	set candleOpen(v: number) { this.buffer[5] = v; }

	get candleHigh(): number { return this.buffer[6]; }
	set candleHigh(v: number) { this.buffer[6] = v; }

	get candleLow(): number { return this.buffer[7]; }
	set candleLow(v: number) { this.buffer[7] = v; }

	get candleVolumeRatio(): number { return this.buffer[8]; }
	set candleVolumeRatio(v: number) { this.buffer[8] = v; }

	get orderBookAvgBid(): number { return this.buffer[9]; }
	set orderBookAvgBid(v: number) { this.buffer[9] = v; }

	get orderBookAvgAsk(): number { return this.buffer[10]; }
	set orderBookAvgAsk(v: number) { this.buffer[10] = v; }

	get orderBookSpreadRatio(): number { return this.buffer[11]; }
	set orderBookSpreadRatio(v: number) { this.buffer[11] = v; }

	get orderBookImbalance(): number { return this.buffer[12]; }
	set orderBookImbalance(v: number) { this.buffer[12] = v; }

	get bookTickerBid(): number { return this.buffer[13]; }
	set bookTickerBid(v: number) { this.buffer[13] = v; }

	get bookTickerAsk(): number { return this.buffer[14]; }
	set bookTickerAsk(v: number) { this.buffer[14] = v; }

	get bookTickerSpreadRatio(): number { return this.buffer[15]; }
	set bookTickerSpreadRatio(v: number) { this.buffer[15] = v; }

	get tradeAvgPrice(): number { return this.buffer[16]; }
	set tradeAvgPrice(v: number) { this.buffer[16] = v; }

	get tradeTotalQty(): number { return this.buffer[17]; }
	set tradeTotalQty(v: number) { this.buffer[17] = v; }

	get tradeBuyRatio(): number { return this.buffer[18]; }
	set tradeBuyRatio(v: number) { this.buffer[18] = v; }

	get tickerPriceChange(): number { return this.buffer[19]; }
	set tickerPriceChange(v: number) { this.buffer[19] = v; }

	get tickerVolume(): number { return this.buffer[20]; }
	set tickerVolume(v: number) { this.buffer[20] = v; }

	get tickerDailyRange(): number { return this.buffer[21]; }
	set tickerDailyRange(v: number) { this.buffer[21] = v; }

	get priceSnapshot(): number { return this.buffer[22]; }
	set priceSnapshot(v: number) { this.buffer[22] = v; }

	get bias(): number { return this.buffer[31]; }
	set bias(v: number) { this.buffer[31] = v; }

	/** Returns a view into the 8-element sliding window (indices 23-30). */
	slidingWindow(): Float32Array {
		return this.buffer.subarray(23, 31);
	}
}
