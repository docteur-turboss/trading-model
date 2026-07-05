import { describe, expect, test } from "@jest/globals";
import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";
import { buildFeatures } from "../../../src/core/feature-builder";
import { FEATURE_DIM } from "../../../src/core/market-data-types";
import { NormalizationStats } from "../../../src/core/normalization-stats";

function baseCandle(overrides?: Partial<CandleData>): CandleData {
	return {
		symbol: "BTCUSDT",
		source: "binance" as never,
		timestamp: 2000,
		market: "crypto" as never,
		open: 100,
		high: 110,
		low: 90,
		close: 105,
		volume: 1000,
		interval: "1m",
		closeTimestamp: 3000,
		...overrides,
	};
}

function baseTrade(overrides?: Partial<TradeData>): TradeData {
	return {
		symbol: "BTCUSDT",
		source: "binance" as never,
		timestamp: 1500,
		market: "crypto" as never,
		price: 104,
		tradeId: 1n,
		quantity: 10,
		side: "buy",
		...overrides,
	};
}

function makeOrderBook(bidPrice: number, askPrice: number): OrderBookData {
	return {
		symbol: "BTCUSDT",
		source: "binance" as never,
		timestamp: 2000,
		market: "crypto" as never,
		bids: new Set([{ price: bidPrice, quantity: 5 }]),
		asks: new Set([{ price: askPrice, quantity: 3 }]),
	};
}

function makeBookTicker(
	bid: number,
	ask: number,
	bidQty = 10,
	askQty = 10
): BookTickerData {
	return {
		symbol: "BTCUSDT",
		source: "binance" as never,
		timestamp: 2000,
		market: "crypto" as never,
		bid,
		ask,
		bidQty,
		askQty,
	};
}

function makeTicker24h(
	open: number,
	high: number,
	low: number,
	last: number,
	volume: number
): TickerData {
	return {
		symbol: "BTCUSDT",
		source: "binance" as never,
		timestamp: 2000,
		market: "crypto" as never,
		open,
		high,
		low,
		last,
		volume,
		closeTimestamp: 3000,
	};
}

function trainedNorm(values: number[]): NormalizationStats {
	const n = new NormalizationStats();
	for (const v of values) {
		n.update(v);
	}
	return n;
}

function defaultNorm() {
	return {
		candleClose: new NormalizationStats(),
		candleVolume: new NormalizationStats(),
		candleOpen: new NormalizationStats(),
		candleHigh: new NormalizationStats(),
		candleLow: new NormalizationStats(),
		tradePrice: new NormalizationStats(),
		tradeQty: new NormalizationStats(),
		bid: new NormalizationStats(),
		ask: new NormalizationStats(),
		spread: new NormalizationStats(),
		tickerVolume: new NormalizationStats(),
	};
}

function makeState(overrides: {
	candles: CandleData[];
	trades?: TradeData[];
	orderBook?: OrderBookData | null;
	bookTicker?: BookTickerData | null;
	ticker24h?: TickerData | null;
	candleClose?: NormalizationStats;
	tradePrice?: NormalizationStats;
	tradeQty?: NormalizationStats;
	bid?: NormalizationStats;
	ask?: NormalizationStats;
	spread?: NormalizationStats;
	tickerVolume?: NormalizationStats;
}) {
	const norm = defaultNorm();
	if (overrides.candleClose) norm.candleClose = overrides.candleClose;
	if (overrides.tradePrice) norm.tradePrice = overrides.tradePrice;
	if (overrides.tradeQty) norm.tradeQty = overrides.tradeQty;
	if (overrides.bid) norm.bid = overrides.bid;
	if (overrides.ask) norm.ask = overrides.ask;
	if (overrides.spread) norm.spread = overrides.spread;
	if (overrides.tickerVolume) norm.tickerVolume = overrides.tickerVolume;
	return {
		candles: overrides.candles,
		trades: overrides.trades ?? [],
		orderBook: overrides.orderBook ?? null,
		bookTicker: overrides.bookTicker ?? null,
		ticker24h: overrides.ticker24h ?? null,
		norm,
	};
}

describe("buildFeatures", () => {
	test("returns Float32Array of correct dimension", () => {
		const s = makeState({
			candles: [
				baseCandle({ close: 100, open: 95, high: 105, low: 92, volume: 800 }),
				baseCandle({
					close: 105,
					open: 102,
					high: 110,
					low: 100,
					volume: 1000,
				}),
			],
		});

		const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
		expect(f).toBeInstanceOf(Float32Array);
		expect(f.length).toBe(FEATURE_DIM);
		expect(f[31]).toBe(1.0);
	});

	describe("candle features (indices 0-8)", () => {
		test("computes candle-derived features", () => {
			const s = makeState({
				candles: [
					baseCandle({ close: 100, open: 98, high: 102, low: 97, volume: 500 }),
					baseCandle({
						close: 105,
						open: 102,
						high: 110,
						low: 100,
						volume: 1000,
					}),
				],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });

			expect(f[0]).toBe(0);
			expect(f[1]).toBe(0);
			expect(f[2]).toBeCloseTo((105 - 100) / 100, 5);
			expect(f[3]).toBeCloseTo((105 - 102) / (110 - 100), 5);
			expect(f[4]).toBeCloseTo((110 - 100) / 105, 5);
			expect(f[8]).toBe(0);
		});

		test("handles idx=0 (no prev candle)", () => {
			const s = makeState({
				candles: [
					baseCandle({ close: 100, open: 95, high: 105, low: 92, volume: 800 }),
				],
			});

			const f = buildFeatures({ state: s, idx: 0, priceSnapshot: { BTCUSDT: 100 } });
			expect(f[2]).toBe(0);
		});
	});

	describe("order book features (indices 9-12)", () => {
		test("computes features when order book exists", () => {
			const cn = trainedNorm([100, 105]);
			const an = trainedNorm([101, 106]);

			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
				orderBook: makeOrderBook(100, 110),
				bid: cn,
				ask: an,
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[9]).toBeCloseTo(cn.normalize(100), 5);
			expect(f[10]).toBeCloseTo(an.normalize(110), 5);
			expect(f[11]).toBeCloseTo((110 - 100) / 110, 5);
			expect(f[12]).toBeCloseTo((5 - 3) / (5 + 3), 5);
		});

		test("skips order book features when null", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[9]).toBe(0);
			expect(f[10]).toBe(0);
			expect(f[11]).toBe(0);
			expect(f[12]).toBe(0);
		});
	});

	describe("book ticker features (indices 13-15)", () => {
		test("computes features when book ticker exists", () => {
			const cn = trainedNorm([100, 105]);

			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
				bookTicker: makeBookTicker(102, 108, 15, 10),
				bid: cn,
				ask: cn,
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[13]).toBeCloseTo(cn.normalize(102), 5);
			expect(f[14]).toBeCloseTo(cn.normalize(108), 5);
			expect(f[15]).toBeCloseTo((108 - 102) / 108, 5);
		});

		test("skips when book ticker is null", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[13]).toBe(0);
			expect(f[14]).toBe(0);
			expect(f[15]).toBe(0);
		});
	});

	describe("trade features (indices 16-18)", () => {
		test("computes features from recent trades", () => {
			const s = makeState({
				candles: [
					baseCandle({ timestamp: 0, closeTimestamp: 1000 }),
					baseCandle({ timestamp: 1000, closeTimestamp: 2000 }),
				],
				trades: [
					baseTrade({ timestamp: 1500, price: 104, quantity: 10, side: "buy" }),
					baseTrade({ timestamp: 1600, price: 106, quantity: 5, side: "sell" }),
				],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[16]).toBe(0);
			expect(f[17]).toBe(0);
			expect(f[18]).toBeCloseTo(10 / 15, 5);
		});

		test("skips trades outside 60s window", () => {
			const s = makeState({
				candles: [
					baseCandle({ timestamp: 0, closeTimestamp: 1000 }),
					baseCandle({ timestamp: 100000, closeTimestamp: 101000 }),
				],
				trades: [baseTrade({ timestamp: 100, price: 100 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[16]).toBe(0);
			expect(f[17]).toBe(0);
			expect(f[18]).toBe(0);
		});
	});

	describe("24h ticker features (indices 19-21)", () => {
		test("computes features when ticker exists", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
				ticker24h: makeTicker24h(100, 120, 90, 110, 50000),
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[19]).toBeCloseTo((110 - 100) / 100, 5);
			expect(f[20]).toBe(0);
			expect(f[21]).toBeCloseTo((120 - 90) / 100, 5);
		});

		test("skips when ticker is null", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[19]).toBe(0);
			expect(f[20]).toBe(0);
			expect(f[21]).toBe(0);
		});
	});

	describe("price snapshot feature (index 22)", () => {
		test("uses snapshot price when available", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 107 } });
			expect(f[22]).toBe(0);
		});

		test("falls back to close price when snapshot missing", () => {
			const cn = trainedNorm([100, 105]);
			const s = makeState({
				candles: [baseCandle({ close: 100 }), baseCandle({ close: 105 })],
				candleClose: cn,
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: {} });
			expect(f[22]).toBeCloseTo(cn.normalize(105), 5);
		});
	});

	describe("lookback window (indices 23-30)", () => {
		test("pads with zeros when fewer than 8 preceding candles", () => {
			const s = makeState({
				candles: [baseCandle({ close: 100 }), baseCandle({ close: 105 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[23]).toBe(0);
			expect(f[24]).toBe(0);
			expect(f[25]).toBe(0);
			expect(f[26]).toBe(0);
			expect(f[27]).toBe(0);
			expect(f[28]).toBe(0);
			expect(f[29]).toBe(0);
			expect(f[30]).toBe(0);
		});

		test("fills lookback with up to 8 preceding closes", () => {
			const candles: CandleData[] = [];
			for (let i = 0; i <= 9; i++) {
				candles.push(baseCandle({ close: 100 + i }));
			}
			const cn = trainedNorm(candles.map((c) => c.close));

			const s = makeState({
				candles,
				candleClose: cn,
			});

			const f = buildFeatures({ state: s, idx: 9, priceSnapshot: { BTCUSDT: 109 } });
			for (let j = 1; j <= 8; j++) {
				expect(f[22 + j]).toBeCloseTo(cn.normalize(100 + j), 5);
			}
		});
	});

	describe("bias (index 31)", () => {
		test("is always 1.0", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: 105 })],
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: { BTCUSDT: 103 } });
			expect(f[31]).toBe(1.0);
		});
	});
});
