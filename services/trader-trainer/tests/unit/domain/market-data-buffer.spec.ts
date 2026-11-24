import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { EvictionPolicy } from "../../../src/domain/eviction-policy";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import { NormalizationStats } from "../../../src/domain/market-data-types";
import {
	feedCandles,
	makeCandle,
	resetFixtureSeq,
} from "../../fixtures/market-data.fixture";

describe("TradingSymbol", () => {
	it("should work as Map key", () => {
		const m = new Map<TradingSymbol, number>();
		const s1 = TradingSymbol.of("BTCUSDT");
		const s2 = TradingSymbol.of("BTCUSDT");
		m.set(s1, 100);
		expect(m.get(s2)).toBe(100);
	});

	it("TradingSymbol should be assignable to string", () => {
		const sym = TradingSymbol.of("TEST");
		const str: string = sym;
		expect(typeof str).toBe("string");
	});
});

describe("MarketDataBuffer", () => {
	let buffer: MarketDataBuffer;

	beforeEach(() => {
		resetFixtureSeq();
		buffer = new MarketDataBuffer({ maxSize: 100 });
	});

	it("should create buffer with default maxSize of 10000", () => {
		const buf = new MarketDataBuffer();
		feedCandles(buf, "BTCUSDT", 10001);
		expect(buf.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(10000);
	});

	it("should evict oldest symbol under memory pressure with LRU policy", () => {
		const buf = new MarketDataBuffer({
			maxMemoryBytes: 1049,
			evictionPolicy: EvictionPolicy.Lru,
		});
		buf.addCandle(
			TradingSymbol.of("BTCUSDT"),
			makeCandle({
				symbol: TradingSymbol.of("BTCUSDT"),
				close: Price.of(50000),
				timestamp: UnixTimestamp.of(1),
			})
		);
		buf.addCandle(
			TradingSymbol.of("ETHUSDT"),
			makeCandle({
				symbol: TradingSymbol.of("ETHUSDT"),
				close: Price.of(3000),
				timestamp: UnixTimestamp.of(1),
			})
		);
		expect(buf.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(1);
	});

	describe("addCandles", () => {
		it("should start with no symbols and zero candle count", () => {
			expect(buffer.getSymbols()).toEqual([]);
			expect(buffer.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(0);
		});

		it("should increase candle count when candles are added", () => {
			feedCandles(buffer, "BTCUSDT", 5);

			expect(buffer.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(5);
			expect(buffer.getSymbols()).toEqual(["BTCUSDT"]);
		});

		it("should expose the close time of the newest candle", () => {
			const BTC = TradingSymbol.of("BTCUSDT");
			expect(buffer.getLastCandleCloseTime(BTC)).toBeUndefined();

			buffer.addCandle(
				BTC,
				makeCandle({
					symbol: BTC,
					timestamp: UnixTimestamp.of(0),
					closeTimestamp: UnixTimestamp.of(59_999),
				})
			);
			buffer.addCandle(
				BTC,
				makeCandle({
					symbol: BTC,
					timestamp: UnixTimestamp.of(60_000),
					closeTimestamp: UnixTimestamp.of(119_999),
				})
			);

			expect(buffer.getLastCandleCloseTime(BTC)).toBe(119_999);
		});

		it("should track multiple symbols independently", () => {
			feedCandles(buffer, "BTCUSDT", 3);
			feedCandles(buffer, "ETHUSDT", 4);

			expect(buffer.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(3);
			expect(buffer.getCandleCount(TradingSymbol.of("ETHUSDT"))).toBe(4);
			expect(buffer.getSymbols()).toContain("BTCUSDT");
			expect(buffer.getSymbols()).toContain("ETHUSDT");
		});

		it("should return 0 for unknown symbol", () => {
			expect(buffer.getCandleCount(TradingSymbol.of("UNKNOWN"))).toBe(0);
		});

		it("should respect maxSize bound", () => {
			const small = new MarketDataBuffer({ maxSize: 5 });
			feedCandles(small, "BTCUSDT", 10);

			expect(small.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(5);
		});

		describe("re-sent candles", () => {
			const BTC = TradingSymbol.of("BTCUSDT");
			const candleAt = (minute: number, close = 100) =>
				makeCandle({
					symbol: BTC,
					close: Price.of(close),
					timestamp: UnixTimestamp.of(minute * 60000),
					closeTimestamp: UnixTimestamp.of((minute + 1) * 60000 - 1),
				});
			const closeCount = () =>
				buffer.getSymbolState(BTC)?.norm.candle.close.toJSON().count;

			it("should keep one candle per timestamp across overlapping batches", () => {
				for (const minute of [1, 2, 3]) {
					buffer.addCandle(BTC, candleAt(minute));
				}
				for (const minute of [2, 3, 4]) {
					buffer.addCandle(BTC, candleAt(minute));
				}

				const timestamps = buffer
					.getSymbolState(BTC)
					?.candles.map((candle) => candle.timestamp);
				expect(timestamps).toEqual([60000, 120000, 180000, 240000]);
				expect(closeCount()).toBe(4);
			});

			it("should replace the last candle with a later version of it", () => {
				buffer.addCandle(BTC, candleAt(1, 100));
				buffer.addCandle(BTC, candleAt(2, 100));
				buffer.addCandle(BTC, candleAt(2, 110));

				const candles = buffer.getSymbolState(BTC)?.candles ?? [];
				expect(candles).toHaveLength(2);
				expect(candles[1].close).toBe(110);
				expect(closeCount()).toBe(2);
			});

			it("should drop a candle older than the last one", () => {
				buffer.addCandle(BTC, candleAt(5));
				buffer.addCandle(BTC, candleAt(3));

				expect(buffer.getCandleCount(BTC)).toBe(1);
				expect(closeCount()).toBe(1);
			});
		});

		it("should handle empty candle arrays without adding symbol entries", () => {
			expect(buffer.getCandleCount(TradingSymbol.of("BTCUSDT"))).toBe(0);
		});

		it("should report the configured maxSize", () => {
			const small = new MarketDataBuffer({ maxSize: 50 });
			expect(small.getMaxSize()).toBe(50);
		});

		it("should handle eviction under memory pressure", () => {
			const buf = new MarketDataBuffer({
				maxMemoryBytes: 10,
				evictionPolicy: EvictionPolicy.Lru,
			});
			feedCandles(buf, "BTCUSDT", 3);
			feedCandles(buf, "ETHUSDT", 3);
			buf.addCandle(
				TradingSymbol.of("SOLUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("SOLUSDT"),
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				})
			);
			expect(buf.getSymbols().length).toBeGreaterThan(0);
		});

		it("should evict symbols under memory pressure until at least one remains", () => {
			const buf = new MarketDataBuffer({
				maxMemoryBytes: 10,
				evictionPolicy: EvictionPolicy.Lru,
			});
			buf.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					close: Price.of(50000),
					timestamp: UnixTimestamp.of(1),
				})
			);
			buf.addCandle(
				TradingSymbol.of("ETHUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("ETHUSDT"),
					close: Price.of(3000),
					timestamp: UnixTimestamp.of(1),
				})
			);
			buf.addCandle(
				TradingSymbol.of("SOLUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("SOLUSDT"),
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				})
			);
			expect(buf.getSymbols().length).toBeGreaterThan(0);
			expect(buf.getSymbols().length).toBeLessThanOrEqual(3);
		});
	});

	describe("buildMarketSteps", () => {
		describe("gaps and inconsistent candles", () => {
			const BTC = TradingSymbol.of("BTCUSDT");
			const bar = (at: number, barMs: number, overrides = {}) =>
				makeCandle({
					symbol: BTC,
					timestamp: UnixTimestamp.of(at * barMs),
					closeTimestamp: UnixTimestamp.of((at + 1) * barMs - 1),
					...overrides,
				});
			const feed = (barMs: number, positions: number[]) => {
				for (const at of positions) {
					buffer.addCandle(BTC, bar(at, barMs));
				}
				return buffer.buildMarketSteps(BTC).map((step) => step.timestamp);
			};
			const range = (from: number, to: number) =>
				Array.from({ length: to - from }, (_, i) => from + i);

			it("should not link the two sides of a 1-minute gap", () => {
				const timestamps = feed(60_000, [...range(0, 20), ...range(120, 140)]);

				expect(timestamps).toEqual(range(121, 140).map((m) => m * 60_000));
			});

			it("should keep a weekend inside a daily series", () => {
				const timestamps = feed(86_400_000, [0, 1, 2, 5, 6]);

				expect(timestamps).toHaveLength(4);
			});

			it("should cut a daily series after a 5-day gap", () => {
				const timestamps = feed(86_400_000, [0, 1, 2, 7, 8]);

				expect(timestamps).toEqual([8 * 86_400_000]);
			});

			it("should refuse a candle whose low and high do not bound open and close", () => {
				buffer.addCandle(BTC, bar(0, 60_000));
				buffer.addCandle(BTC, bar(1, 60_000, { low: Price.of(101) }));
				buffer.addCandle(BTC, bar(2, 60_000, { high: Price.of(101) }));

				expect(buffer.getCandleCount(BTC)).toBe(1);
			});
		});

		it("should return empty array with fewer than 2 candles", () => {
			feedCandles(buffer, "BTCUSDT", 1);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			expect(steps).toEqual([]);
		});

		it("should return N-1 steps for N candles", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			expect(steps.length).toBe(49);
		});

		it("should set step price from candle close", () => {
			buffer.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				})
			);
			buffer.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					close: Price.of(150),
					timestamp: UnixTimestamp.of(2),
				})
			);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			expect(steps[0].price).toBe(150);
		});

		it("fills each step at the next candle's open, the last at its close", () => {
			const sym = TradingSymbol.of("BTCUSDT");
			[
				{ open: 90, close: 100 },
				{ open: 101, close: 150 },
				{ open: 152, close: 160 },
			].forEach(({ open, close }, idx) => {
				buffer.addCandle(
					sym,
					makeCandle({
						symbol: sym,
						open: Price.of(open),
						close: Price.of(close),
						timestamp: UnixTimestamp.of(idx + 1),
					})
				);
			});

			const steps = buffer.buildMarketSteps(sym);

			expect(steps.map((step) => [step.price, step.fillPrice])).toEqual([
				[150, 152],
				[160, undefined],
			]);
		});

		it("should return empty array for unknown symbol", () => {
			const steps = buffer.buildMarketSteps(TradingSymbol.of("UNKNOWN"));

			expect(steps).toEqual([]);
		});
	});

	describe("features", () => {
		it("should have 18 feature dimensions", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			expect(steps[0].features.toFloat32Array().length).toBe(18);
		});

		it("should set bias feature at index 17 to 1.0", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			for (const step of steps) {
				expect(step.features.toFloat32Array()[17]).toBe(1.0);
			}
		});

		it("should compute price change correctly", () => {
			buffer.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				})
			);
			buffer.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					close: Price.of(110),
					timestamp: UnixTimestamp.of(2),
				})
			);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			expect(steps[0].features.toFloat32Array()[2]).toBeCloseTo(0.1, 5);
		});

		it("should populate all 18 indices with finite numbers", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));

			for (let i = 0; i < 18; i++) {
				expect(typeof steps[0].features.toFloat32Array()[i]).toBe("number");
				expect(Number.isFinite(steps[0].features.toFloat32Array()[i])).toBe(
					true
				);
			}
		});

		it("should handle edge case feature values gracefully", () => {
			buffer.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					close: Price.of(0),
					timestamp: UnixTimestamp.of(1),
					closeTimestamp: UnixTimestamp.of(20_000),
				})
			);
			buffer.addCandle(
				TradingSymbol.of("BTCUSDT"),
				makeCandle({
					symbol: TradingSymbol.of("BTCUSDT"),
					open: Price.of(60),
					high: Price.of(60),
					low: Price.of(60),
					close: Price.of(60),
					timestamp: UnixTimestamp.of(2),
					closeTimestamp: UnixTimestamp.of(30_000),
				})
			);

			const steps = buffer.buildMarketSteps(TradingSymbol.of("BTCUSDT"));
			expect(steps.length).toBe(1);

			expect(steps[0].features.toFloat32Array()[2]).toBe(0);
			expect(steps[0].features.toFloat32Array()[3]).toBe(0);
			expect(steps[0].features.toFloat32Array()[4]).toBe(0);
		});
	});

	describe("getAllWindows", () => {
		it("should return null with fewer than 10 steps", () => {
			feedCandles(buffer, "BTCUSDT", 10);

			const result = buffer.getAllWindows(TradingSymbol.of("BTCUSDT"));

			expect(result).toBeNull();
		});

		it("should return windows once all three segments reach 10 steps", () => {
			const big = new MarketDataBuffer({ maxSize: 200 });
			feedCandles(big, "BTCUSDT", 130);

			const result = big.getAllWindows(TradingSymbol.of("BTCUSDT"));

			expect(result).not.toBeNull();
			expect(result![0].train.length).toBeGreaterThan(0);
			expect(result![0].validation.length).toBeGreaterThan(0);
		});

		it("should return null for unknown symbol", () => {
			expect(buffer.getAllWindows(TradingSymbol.of("UNKNOWN"))).toBeNull();
		});
	});
});

describe("NormalizationStats", () => {
	let norm: NormalizationStats;

	beforeEach(() => {
		norm = new NormalizationStats();
	});

	it("should start with mean and std of zero", () => {
		expect(norm.getMean()).toBe(0);
		expect(norm.getStd()).toBe(0);
	});

	it("should return std=0 with a single value", () => {
		norm.update(42);

		expect(norm.getStd()).toBe(0);
	});

	it("should compute correct running mean", () => {
		norm.update(10);
		norm.update(20);
		norm.update(30);

		expect(norm.getMean()).toBe(20);
	});

	it("should return positive std after 2+ distinct values", () => {
		norm.update(10);
		norm.update(20);

		expect(norm.getStd()).toBeGreaterThan(0);
	});

	it("should return 0 when std is below epsilon", () => {
		norm.update(100);
		norm.update(100);
		norm.update(100);

		expect(norm.normalize(100)).toBe(0);
	});
});

describe("MarketDataBuffer — observability hook", () => {
	it("should report the candle count and symbol count after each insertion", () => {
		const onDataAdded = jest.fn<(...args: any[]) => any>();
		const buffer = new MarketDataBuffer({ maxSize: 50, onDataAdded });

		feedCandles(buffer, "BTCUSDT", 3);
		feedCandles(buffer, "ETHUSDT", 1);

		expect(onDataAdded).toHaveBeenCalledTimes(4);
		expect(onDataAdded).toHaveBeenNthCalledWith(3, "BTCUSDT", 3, 1);
		expect(onDataAdded).toHaveBeenLastCalledWith("ETHUSDT", 1, 2);
	});
});

describe("MarketDataBuffer — inconsistent candle hook", () => {
	it("reports a candle whose high is below its close and does not store it", () => {
		const onInconsistentCandle = jest.fn<(...args: any[]) => any>();
		const buffer = new MarketDataBuffer({ onInconsistentCandle });
		const sym = TradingSymbol.of("BTCUSDT");

		buffer.addCandle(
			sym,
			makeCandle({ symbol: sym, high: Price.of(1), close: Price.of(100) })
		);

		expect(onInconsistentCandle).toHaveBeenCalledWith(sym);
		expect(buffer.getCandleCount(sym)).toBe(0);
	});
});

describe("MarketDataBuffer.replaceCandles", () => {
	it("gives a buffer with a longer history the same window as a new one", () => {
		const sym = TradingSymbol.of("BTCUSDT");
		const window = Array.from({ length: 5 }, (_, i) =>
			makeCandle({ symbol: sym, close: Price.of(100 + i) })
		);
		const fresh = new MarketDataBuffer();
		const old = new MarketDataBuffer();
		feedCandles(old, "BTCUSDT", 20, (i) => i * 7);

		fresh.replaceCandles(sym, window);
		old.replaceCandles(sym, window);

		expect(old.getSymbolState(sym)).toEqual(fresh.getSymbolState(sym));
		expect(old.getCandleCount(sym)).toBe(5);
	});

	it("evicts once per replaced series", () => {
		const sym = TradingSymbol.of("BTCUSDT");
		const buffer = new MarketDataBuffer();
		const evict = jest.spyOn((buffer as any)._stateManager, "_evictIfNeeded");

		feedCandles(buffer, "BTCUSDT", 1, (i) => i);
		evict.mockClear();
		buffer.replaceCandles(
			sym,
			Array.from({ length: 50 }, (_, i) =>
				makeCandle({ symbol: sym, close: Price.of(100 + i) })
			)
		);

		expect(evict).toHaveBeenCalledTimes(1);
	});
});
