import { beforeEach, describe, expect, it } from "@jest/globals";
import {
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
import { MarketDataBuffer } from "../../../src/core/market-data-buffer";
import {
	fromSymbol,
	NormalizationStats,
	type TradingSymbol,
} from "../../../src/core/market-data-types";
import {
	feedCandles,
	makeBookTicker,
	makeBookTickerZeroBidAsk,
	makeCandle,
	makeOrderBook,
	makeOrderBookEmpty,
	makeTicker24h,
	makeTrade,
	resetFixtureSeq,
} from "../../fixtures/market-data.fixture";

describe("TradingSymbol", () => {
	it("should create branded symbol via toSymbol", () => {
		const sym = toSymbol("BTCUSDT");
		expect(fromSymbol(sym)).toBe("BTCUSDT");
	});

	it("should preserve identity through roundtrip", () => {
		const original = "ETHUSDT";
		expect(fromSymbol(toSymbol(original))).toBe(original);
	});

	it("should create distinct symbols for different strings", () => {
		const a = toSymbol("BTCUSDT");
		const b = toSymbol("ETHUSDT");
		expect(fromSymbol(a)).not.toBe(fromSymbol(b));
	});

	it("should work as Map key", () => {
		const m = new Map<TradingSymbol, number>();
		const s1 = toSymbol("BTCUSDT");
		const s2 = toSymbol("BTCUSDT");
		m.set(s1, 100);
		expect(m.get(s2)).toBe(100);
	});

	it("TradingSymbol should be assignable to string", () => {
		const sym = toSymbol("TEST");
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
		expect(buf.getCandleCount("BTCUSDT")).toBe(10000);
	});

	it("should evict oldest symbol under memory pressure with LRU policy", () => {
		const buf = new MarketDataBuffer({
			maxMemoryMb: 0.001,
			evictionPolicy: "LRU",
		});
		buf.addCandles("BTCUSDT", [
			makeCandle({
				symbol: "BTCUSDT",
				close: Price.of(50000),
				timestamp: UnixTimestamp.of(1),
			}),
		]);
		buf.addCandles("ETHUSDT", [
			makeCandle({
				symbol: "ETHUSDT",
				close: Price.of(3000),
				timestamp: UnixTimestamp.of(1),
			}),
		]);
		expect(buf.getCandleCount("BTCUSDT")).toBe(1);
	});

	describe("addCandles", () => {
		it("should start with no symbols and zero candle count", () => {
			expect(buffer.getSymbols()).toEqual([]);
			expect(buffer.getCandleCount("BTCUSDT")).toBe(0);
		});

		it("should increase candle count when candles are added", () => {
			feedCandles(buffer, "BTCUSDT", 5);

			expect(buffer.getCandleCount("BTCUSDT")).toBe(5);
			expect(buffer.getSymbols()).toEqual(["BTCUSDT"]);
		});

		it("should track multiple symbols independently", () => {
			feedCandles(buffer, "BTCUSDT", 3);
			feedCandles(buffer, "ETHUSDT", 4);

			expect(buffer.getCandleCount("BTCUSDT")).toBe(3);
			expect(buffer.getCandleCount("ETHUSDT")).toBe(4);
			expect(buffer.getSymbols()).toContain("BTCUSDT");
			expect(buffer.getSymbols()).toContain("ETHUSDT");
		});

		it("should return 0 for unknown symbol", () => {
			expect(buffer.getCandleCount("UNKNOWN")).toBe(0);
		});

		it("should respect maxSize bound", () => {
			const small = new MarketDataBuffer({ maxSize: 5 });
			feedCandles(small, "BTCUSDT", 10);

			expect(small.getCandleCount("BTCUSDT")).toBe(5);
		});

		it("should handle empty candle arrays without adding symbol entries", () => {
			buffer.addCandles("BTCUSDT", []);

			expect(buffer.getCandleCount("BTCUSDT")).toBe(0);
		});

		it("should report the configured maxSize", () => {
			const small = new MarketDataBuffer({ maxSize: 50 });
			expect(small.getMaxSize()).toBe(50);
		});

		it("should handle eviction with orphaned accessOrder entry", () => {
			const buf = new MarketDataBuffer({
				maxMemoryMb: 0.00001,
				evictionPolicy: "LRU",
			});
			feedCandles(buf, "BTCUSDT", 3);
			feedCandles(buf, "ETHUSDT", 3);
			(buf as any)._accessOrder[0] = undefined as any;
			buf.addCandles("SOLUSDT", [
				makeCandle({
					symbol: "SOLUSDT",
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				}),
			]);
			expect(buf.getSymbols().length).toBeGreaterThan(0);
		});

		it("should handle eviction with symbol missing from states", () => {
			const buf = new MarketDataBuffer({
				maxMemoryMb: 0.00001,
				evictionPolicy: "LRU",
			});
			feedCandles(buf, "BTCUSDT", 3);
			feedCandles(buf, "ETHUSDT", 3);
			(buf as any)._states.delete((buf as any)._accessOrder[0]);
			feedCandles(buf, "SOLUSDT", 3);
			expect(buf.getSymbols().length).toBeLessThanOrEqual(3);
		});
	});

	describe("buildMarketSteps", () => {
		it("should return empty array with fewer than 2 candles", () => {
			feedCandles(buffer, "BTCUSDT", 1);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps).toEqual([]);
		});

		it("should return N-1 steps for N candles", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps.length).toBe(49);
		});

		it("should set step price from candle close", () => {
			buffer.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				}),
			]);
			buffer.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					close: Price.of(150),
					timestamp: UnixTimestamp.of(2),
				}),
			]);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps[0].price).toBe(150);
		});

		it("should return empty array for unknown symbol", () => {
			const steps = buffer.buildMarketSteps("UNKNOWN");

			expect(steps).toEqual([]);
		});
	});

	describe("features", () => {
		it("should have 32 feature dimensions", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps[0].features.toFloat32Array().length).toBe(32);
		});

		it("should set bias feature at index 31 to 1.0", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			for (const step of steps) {
				expect(step.features.toFloat32Array()[31]).toBe(1.0);
			}
		});

		it("should compute price change correctly", () => {
			buffer.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					close: Price.of(100),
					timestamp: UnixTimestamp.of(1),
				}),
			]);
			buffer.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					close: Price.of(110),
					timestamp: UnixTimestamp.of(2),
				}),
			]);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps[0].features.toFloat32Array()[2]).toBeCloseTo(0.1, 5);
		});

		it("should populate all 32 indices with finite numbers", () => {
			feedCandles(buffer, "BTCUSDT", 50);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			for (let i = 0; i < 32; i++) {
				expect(typeof steps[0].features.toFloat32Array()[i]).toBe("number");
				expect(Number.isFinite(steps[0].features.toFloat32Array()[i])).toBe(true);
			}
		});

		it("should handle edge case feature values gracefully", () => {
			buffer.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					close: Price.of(0),
					timestamp: UnixTimestamp.of(1),
				}),
			]);
			buffer.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					high: Price.of(60),
					low: Price.of(60),
					close: Price.of(0),
					timestamp: UnixTimestamp.of(2),
				}),
			]);

			buffer.addTrades("BTCUSDT", [
				{
					symbol: "BTCUSDT",
					source: SourceType.BINANCE,
					timestamp: UnixTimestamp.of(0),
					market: MarketType.CRYPTO,
					price: Price.of(100),
					tradeId: BigInt(999),
					quantity: Volume.of(0),
					side: TradeSide.BUY,
				},
			]);

			buffer.setTicker24h("BTCUSDT", {
				...makeTicker24h("BTCUSDT"),
				open: Price.of(0),
			});

			const steps = buffer.buildMarketSteps("BTCUSDT");
			expect(steps.length).toBe(1);

			expect(steps[0].features.toFloat32Array()[2]).toBe(0);
			expect(steps[0].features.toFloat32Array()[3]).toBe(0);
			expect(steps[0].features.toFloat32Array()[4]).toBe(0);
			expect(steps[0].features.toFloat32Array()[18]).toBe(0.5);
			expect(steps[0].features.toFloat32Array()[19]).toBe(0);
			expect(steps[0].features.toFloat32Array()[21]).toBe(0);
		});
	});

	describe("setOrderBook", () => {
		it("should populate order book features when candles exist", () => {
			buffer.setOrderBook("BTCUSDT", makeOrderBook("BTCUSDT"));
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			for (const idx of [9, 10, 11, 12]) {
				expect(typeof steps[0].features.toFloat32Array()[idx]).toBe("number");
			}
		});

		it("should account for orderBook size in eviction memory estimate", () => {
			const buf = new MarketDataBuffer({
				maxMemoryMb: 0.0001,
				evictionPolicy: "LRU",
			});
			buf.addCandles("BTCUSDT", [
				makeCandle({
					symbol: "BTCUSDT",
					close: Price.of(50000),
					timestamp: UnixTimestamp.of(1),
				}),
			]);
			buf.setOrderBook("BTCUSDT", makeOrderBook("BTCUSDT"));
			buf.addCandles("ETHUSDT", [
				makeCandle({
					symbol: "ETHUSDT",
					close: Price.of(3000),
					timestamp: UnixTimestamp.of(1),
				}),
			]);
			expect(buf.getCandleCount("BTCUSDT")).toBe(0);
		});

		it("should handle empty bids and asks gracefully", () => {
			buffer.setOrderBook("BTCUSDT", makeOrderBookEmpty("BTCUSDT"));
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps[0].features.toFloat32Array()[9]).toBe(0);
			expect(steps[0].features.toFloat32Array()[10]).toBe(0);
		});
	});

	describe("setBookTicker", () => {
		it("should populate book ticker features", () => {
			buffer.setBookTicker("BTCUSDT", makeBookTicker("BTCUSDT"));
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			for (const idx of [13, 14, 15]) {
				expect(typeof steps[0].features.toFloat32Array()[idx]).toBe("number");
			}
		});

		it("should handle zero bid and ask values", () => {
			buffer.setBookTicker("BTCUSDT", makeBookTickerZeroBidAsk("BTCUSDT"));
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps[0].features.toFloat32Array()[13]).toBe(0);
			expect(steps[0].features.toFloat32Array()[14]).toBe(0);
			expect(steps[0].features.toFloat32Array()[15]).toBe(0);
		});
	});

	describe("setTicker24h", () => {
		it("should populate 24h ticker features", () => {
			buffer.setTicker24h("BTCUSDT", makeTicker24h("BTCUSDT"));
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(steps[0].features.toFloat32Array()[19]).toBeCloseTo(0.05, 5);
			expect(typeof steps[0].features.toFloat32Array()[20]).toBe("number");
		});
	});

	describe("setPriceSnapshot", () => {
		it("should use snapshot price when available", () => {
			buffer.setPriceSnapshot({ [toSymbol("BTCUSDT")]: Price.of(200) });
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(typeof steps[0].features.toFloat32Array()[22]).toBe("number");
		});

		it("should merge multiple snapshot calls", () => {
			buffer.setPriceSnapshot({ [toSymbol("BTCUSDT")]: Price.of(150) });
			buffer.setPriceSnapshot({ [toSymbol("ETHUSDT")]: Price.of(200) });
			feedCandles(buffer, "BTCUSDT", 30);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			expect(typeof steps[0].features.toFloat32Array()[22]).toBe("number");
		});
	});

	describe("addTrades", () => {
		it("should populate trade features when candles exist", () => {
			feedCandles(buffer, "BTCUSDT", 30);
			buffer.addTrades("BTCUSDT", [
				makeTrade("BTCUSDT"),
				makeTrade("BTCUSDT", TradeSide.SELL),
			]);

			const steps = buffer.buildMarketSteps("BTCUSDT");

			for (const idx of [16, 17, 18]) {
				expect(typeof steps[0].features.toFloat32Array()[idx]).toBe("number");
			}
		});

		it("should bound trade count by maxSize", () => {
			const buf = new MarketDataBuffer({ maxSize: 5 });
			buf.addTrades(
				"BTCUSDT",
				Array.from({ length: 10 }, (_, _i) =>
					makeTrade("BTCUSDT", TradeSide.BUY)
				)
			);

			expect((buf as any)._states.get(toSymbol("BTCUSDT"))!.trades.length).toBe(
				5
			);
		});
	});

	describe("splitTrainValidation", () => {
		it("should split steps 80/20 by default", () => {
			feedCandles(buffer, "BTCUSDT", 101);
			const steps = buffer.buildMarketSteps("BTCUSDT");
			const splitIdx = Math.floor(steps.length * 0.8);

			const result = buffer.splitTrainValidation(steps, 0.2);

			expect(result.id).toBeTruthy();
			expect(result.train.length).toBe(splitIdx);
			expect(result.validation.length).toBe(steps.length - splitIdx);
		});

		it("should split steps with custom ratio", () => {
			feedCandles(buffer, "BTCUSDT", 101);
			const steps = buffer.buildMarketSteps("BTCUSDT");
			const splitIdx = Math.floor(steps.length * 0.7);

			const result = buffer.splitTrainValidation(steps, 0.3);

			expect(result.train.length).toBe(splitIdx);
			expect(result.validation.length).toBe(steps.length - splitIdx);
		});

		it("should preserve step order in both splits", () => {
			feedCandles(buffer, "BTCUSDT", 101);
			const steps = buffer.buildMarketSteps("BTCUSDT");
			const splitIdx = Math.floor(steps.length * 0.8);

			const result = buffer.splitTrainValidation(steps, 0.2);

			expect(result.train[0].timestamp).toBe(steps[0].timestamp);
			expect(result.validation[0].timestamp).toBe(steps[splitIdx].timestamp);
		});
	});

	describe("getAllWindows", () => {
		it("should return null with fewer than 10 steps", () => {
			feedCandles(buffer, "BTCUSDT", 10);

			const result = buffer.getAllWindows("BTCUSDT");

			expect(result).toBeNull();
		});

		it("should return windows with 11+ candles (10+ steps)", () => {
			feedCandles(buffer, "BTCUSDT", 11);

			const result = buffer.getAllWindows("BTCUSDT");

			expect(result).not.toBeNull();
			expect(result!.train.length).toBeGreaterThan(0);
			expect(result!.validation.length).toBeGreaterThan(0);
		});

		it("should return null for unknown symbol", () => {
			expect(buffer.getAllWindows("UNKNOWN")).toBeNull();
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
