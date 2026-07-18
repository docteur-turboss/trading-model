import { describe, expect, test } from "@jest/globals";
import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";
import {
	CandleInterval,
	MarketType,
	SourceType,
	TradeSide,
} from "@trading-model/common/config/event.types";
import {
	Price,
	toSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import { buildFeatures } from "../../../src/core/feature-builder";
import { FEATURE_DIM } from "../../../src/core/market-data-types";
import { NormalizationStats } from "../../../src/core/normalization-stats";

function baseCandle(overrides?: Partial<CandleData>): CandleData {
	return {
		symbol: toSymbol("BTCUSDT"),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(2000),
		market: MarketType.Crypto,
		open: Price.of(100),
		high: Price.of(110),
		low: Price.of(90),
		close: Price.of(105),
		volume: Volume.of(1000),
		interval: CandleInterval.Min1,
		closeTimestamp: UnixTimestamp.of(3000),
		...overrides,
	};
}

function baseTrade(overrides?: Partial<TradeData>): TradeData {
	return {
		symbol: toSymbol("BTCUSDT"),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(1500),
		market: MarketType.Crypto,
		price: Price.of(104),
		tradeId: 1n,
		quantity: Volume.of(10),
		side: TradeSide.Buy,
		...overrides,
	};
}

function makeOrderBook(bidPrice: number, askPrice: number): OrderBookData {
	return {
		symbol: toSymbol("BTCUSDT"),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(2000),
		market: MarketType.Crypto,
		bids: new Set([{ price: Price.of(bidPrice), quantity: Volume.of(5) }]),
		asks: new Set([{ price: Price.of(askPrice), quantity: Volume.of(3) }]),
	};
}

function makeBookTicker(
	bid: number,
	ask: number,
	bidQty = 10,
	askQty = 10
): BookTickerData {
	return {
		symbol: toSymbol("BTCUSDT"),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(2000),
		market: MarketType.Crypto,
		bid: Price.of(bid),
		ask: Price.of(ask),
		bidQty: Volume.of(bidQty),
		askQty: Volume.of(askQty),
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
		symbol: toSymbol("BTCUSDT"),
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(2000),
		market: MarketType.Crypto,
		open: Price.of(open),
		high: Price.of(high),
		low: Price.of(low),
		last: Price.of(last),
		volume: Volume.of(volume),
		closeTimestamp: UnixTimestamp.of(3000),
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
		candle: {
			close: new NormalizationStats(),
			volume: new NormalizationStats(),
			open: new NormalizationStats(),
			high: new NormalizationStats(),
			low: new NormalizationStats(),
		},
		trade: {
			price: new NormalizationStats(),
			qty: new NormalizationStats(),
		},
		book: {
			bid: new NormalizationStats(),
			ask: new NormalizationStats(),
			spread: new NormalizationStats(),
		},
		ticker: {
			volume: new NormalizationStats(),
		},
	};
}

function makeState(overrides: {
	candles: CandleData[];
	trades?: TradeData[];
	orderBook?: OrderBookData;
	bookTicker?: BookTickerData;
	ticker24h?: TickerData;
	candleClose?: NormalizationStats;
	tradePrice?: NormalizationStats;
	tradeQty?: NormalizationStats;
	bid?: NormalizationStats;
	ask?: NormalizationStats;
	spread?: NormalizationStats;
	tickerVolume?: NormalizationStats;
}) {
	const norm = defaultNorm();
	if (overrides.candleClose) {
		norm.candle.close = overrides.candleClose;
	}
	if (overrides.tradePrice) {
		norm.trade.price = overrides.tradePrice;
	}
	if (overrides.tradeQty) {
		norm.trade.qty = overrides.tradeQty;
	}
	if (overrides.bid) {
		norm.book.bid = overrides.bid;
	}
	if (overrides.ask) {
		norm.book.ask = overrides.ask;
	}
	if (overrides.spread) {
		norm.book.spread = overrides.spread;
	}
	if (overrides.tickerVolume) {
		norm.ticker.volume = overrides.tickerVolume;
	}
	return {
		candles: overrides.candles,
		trades: overrides.trades ?? [],
		orderBook: overrides.orderBook,
		bookTicker: overrides.bookTicker,
		ticker24h: overrides.ticker24h,
		norm,
	};
}

describe("buildFeatures", () => {
	test("returns Float32Array of correct dimension", () => {
		const s = makeState({
			candles: [
				baseCandle({
					close: Price.of(100),
					open: Price.of(95),
					high: Price.of(105),
					low: Price.of(92),
					volume: Volume.of(800),
				}),
				baseCandle({
					close: Price.of(105),
					open: Price.of(102),
					high: Price.of(110),
					low: Price.of(100),
					volume: Volume.of(1000),
				}),
			],
		});

		const f = buildFeatures({
			state: s,
			idx: 1,
			priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
		});
		expect(f.toFloat32Array()).toBeInstanceOf(Float32Array);
		expect(f.toFloat32Array().length).toBe(FEATURE_DIM);
		expect(f.toFloat32Array()[31]).toBe(1.0);
	});

	describe("candle features (indices 0-8)", () => {
		test("computes candle-derived features", () => {
			const s = makeState({
				candles: [
					baseCandle({
						close: Price.of(100),
						open: Price.of(98),
						high: Price.of(102),
						low: Price.of(97),
						volume: Volume.of(500),
					}),
					baseCandle({
						close: Price.of(105),
						open: Price.of(102),
						high: Price.of(110),
						low: Price.of(100),
						volume: Volume.of(1000),
					}),
				],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});

			expect(f.toFloat32Array()[0]).toBe(0);
			expect(f.toFloat32Array()[1]).toBe(0);
			expect(f.toFloat32Array()[2]).toBeCloseTo((105 - 100) / 100, 5);
			expect(f.toFloat32Array()[3]).toBeCloseTo((105 - 102) / (110 - 100), 5);
			expect(f.toFloat32Array()[4]).toBeCloseTo((110 - 100) / 105, 5);
			expect(f.toFloat32Array()[8]).toBe(0);
		});

		test("handles idx=0 (no prev candle)", () => {
			const s = makeState({
				candles: [
					baseCandle({
						close: Price.of(100),
						open: Price.of(95),
						high: Price.of(105),
						low: Price.of(92),
						volume: Volume.of(800),
					}),
				],
			});

			const f = buildFeatures({
				state: s,
				idx: 0,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(100) },
			});
			expect(f.toFloat32Array()[2]).toBe(0);
		});
	});

	describe("order book features (indices 9-12)", () => {
		test("computes features when order book exists", () => {
			const cn = trainedNorm([100, 105]);
			const an = trainedNorm([101, 106]);

			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
				orderBook: makeOrderBook(100, 110),
				bid: cn,
				ask: an,
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[9]).toBeCloseTo(cn.normalize(100), 5);
			expect(f.toFloat32Array()[10]).toBeCloseTo(an.normalize(110), 5);
			expect(f.toFloat32Array()[11]).toBeCloseTo((110 - 100) / 110, 5);
			expect(f.toFloat32Array()[12]).toBeCloseTo((5 - 3) / (5 + 3), 5);
		});

		test("skips order book features when null", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[9]).toBe(0);
			expect(f.toFloat32Array()[10]).toBe(0);
			expect(f.toFloat32Array()[11]).toBe(0);
			expect(f.toFloat32Array()[12]).toBe(0);
		});
	});

	describe("book ticker features (indices 13-15)", () => {
		test("computes features when book ticker exists", () => {
			const cn = trainedNorm([100, 105]);

			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
				bookTicker: makeBookTicker(102, 108, 15, 10),
				bid: cn,
				ask: cn,
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[13]).toBeCloseTo(cn.normalize(102), 5);
			expect(f.toFloat32Array()[14]).toBeCloseTo(cn.normalize(108), 5);
			expect(f.toFloat32Array()[15]).toBeCloseTo((108 - 102) / 108, 5);
		});

		test("skips when book ticker is null", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[13]).toBe(0);
			expect(f.toFloat32Array()[14]).toBe(0);
			expect(f.toFloat32Array()[15]).toBe(0);
		});
	});

	describe("trade features (indices 16-18)", () => {
		test("computes features from recent trades", () => {
			const s = makeState({
				candles: [
					baseCandle({
						timestamp: UnixTimestamp.of(0),
						closeTimestamp: UnixTimestamp.of(1000),
					}),
					baseCandle({
						timestamp: UnixTimestamp.of(1000),
						closeTimestamp: UnixTimestamp.of(2000),
					}),
				],
				trades: [
					baseTrade({
						timestamp: UnixTimestamp.of(1500),
						price: Price.of(104),
						quantity: Volume.of(10),
						side: TradeSide.Buy,
					}),
					baseTrade({
						timestamp: UnixTimestamp.of(1600),
						price: Price.of(106),
						quantity: Volume.of(5),
						side: TradeSide.Sell,
					}),
				],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[16]).toBe(0);
			expect(f.toFloat32Array()[17]).toBe(0);
			expect(f.toFloat32Array()[18]).toBeCloseTo(10 / 15, 5);
		});

		test("skips trades outside 60s window", () => {
			const s = makeState({
				candles: [
					baseCandle({
						timestamp: UnixTimestamp.of(0),
						closeTimestamp: UnixTimestamp.of(1000),
					}),
					baseCandle({
						timestamp: UnixTimestamp.of(100000),
						closeTimestamp: UnixTimestamp.of(101000),
					}),
				],
				trades: [
					baseTrade({ timestamp: UnixTimestamp.of(100), price: Price.of(100) }),
				],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[16]).toBe(0);
			expect(f.toFloat32Array()[17]).toBe(0);
			expect(f.toFloat32Array()[18]).toBe(0);
		});
	});

	describe("24h ticker features (indices 19-21)", () => {
		test("computes features when ticker exists", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
				ticker24h: makeTicker24h(100, 120, 90, 110, 50000),
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[19]).toBeCloseTo((110 - 100) / 100, 5);
			expect(f.toFloat32Array()[20]).toBe(0);
			expect(f.toFloat32Array()[21]).toBeCloseTo((120 - 90) / 100, 5);
		});

		test("skips when ticker is null", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[19]).toBe(0);
			expect(f.toFloat32Array()[20]).toBe(0);
			expect(f.toFloat32Array()[21]).toBe(0);
		});
	});

	describe("price snapshot feature (index 22)", () => {
		test("uses snapshot price when available", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(107) },
			});
			expect(f.toFloat32Array()[22]).toBe(0);
		});

		test("falls back to close price when snapshot missing", () => {
			const cn = trainedNorm([100, 105]);
			const s = makeState({
				candles: [
					baseCandle({ close: Price.of(100) }),
					baseCandle({ close: Price.of(105) }),
				],
				candleClose: cn,
			});

			const f = buildFeatures({ state: s, idx: 1, priceSnapshot: {} });
			expect(f.toFloat32Array()[22]).toBeCloseTo(cn.normalize(105), 5);
		});
	});

	describe("lookback window (indices 23-30)", () => {
		test("pads with zeros when fewer than 8 preceding candles", () => {
			const s = makeState({
				candles: [
					baseCandle({ close: Price.of(100) }),
					baseCandle({ close: Price.of(105) }),
				],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[23]).toBe(0);
			expect(f.toFloat32Array()[24]).toBe(0);
			expect(f.toFloat32Array()[25]).toBe(0);
			expect(f.toFloat32Array()[26]).toBe(0);
			expect(f.toFloat32Array()[27]).toBe(0);
			expect(f.toFloat32Array()[28]).toBe(0);
			expect(f.toFloat32Array()[29]).toBe(0);
			expect(f.toFloat32Array()[30]).toBe(0);
		});

		test("fills lookback with up to 8 preceding closes", () => {
			const candles: CandleData[] = [];
			for (let i = 0; i <= 9; i++) {
				candles.push(baseCandle({ close: Price.of(100 + i) }));
			}
			const cn = trainedNorm(candles.map((c) => c.close));

			const s = makeState({
				candles,
				candleClose: cn,
			});

			const f = buildFeatures({
				state: s,
				idx: 9,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(109) },
			});
			for (let j = 1; j <= 8; j++) {
				expect(f.toFloat32Array()[22 + j]).toBeCloseTo(
					cn.normalize(100 + j),
					5
				);
			}
		});
	});

	describe("bias (index 31)", () => {
		test("is always 1.0", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
				priceSnapshot: { [toSymbol("BTCUSDT")]: Price.of(103) },
			});
			expect(f.toFloat32Array()[31]).toBe(1.0);
		});
	});
});
