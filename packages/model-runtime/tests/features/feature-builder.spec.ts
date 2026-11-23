import { describe, expect, test } from "@jest/globals";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	CandleInterval,
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { FEATURE_DIM } from "../../src/feature-vector-codec";
import { buildFeatures } from "../../src/features/feature-builder";
import { NormalizationStats } from "../../src/features/normalization-stats";

function baseCandle(overrides?: Partial<CandleData>): CandleData {
	return {
		symbol: TradingSymbol.of("BTCUSDT"),
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
	};
}

function makeState(overrides: {
	candles: CandleData[];
	candleClose?: NormalizationStats;
}) {
	const norm = defaultNorm();
	if (overrides.candleClose) {
		norm.candle.close = overrides.candleClose;
	}
	return { candles: overrides.candles, norm };
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
		});
		expect(f.toFloat32Array()).toBeInstanceOf(Float32Array);
		expect(f.toFloat32Array().length).toBe(FEATURE_DIM);
		expect(f.toFloat32Array()[17]).toBe(1.0);
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
			});
			expect(f.toFloat32Array()[2]).toBe(0);
		});
	});

	describe("lookback window (indices 9-16)", () => {
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
			});
			expect(f.toFloat32Array()[9]).toBe(0);
			expect(f.toFloat32Array()[10]).toBe(0);
			expect(f.toFloat32Array()[11]).toBe(0);
			expect(f.toFloat32Array()[12]).toBe(0);
			expect(f.toFloat32Array()[13]).toBe(0);
			expect(f.toFloat32Array()[14]).toBe(0);
			expect(f.toFloat32Array()[15]).toBe(0);
			expect(f.toFloat32Array()[16]).toBe(0);
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
			});
			for (let j = 1; j <= 8; j++) {
				expect(f.toFloat32Array()[8 + j]).toBeCloseTo(cn.normalize(100 + j), 5);
			}
		});
	});

	describe("bias (index 17)", () => {
		test("is always 1.0", () => {
			const s = makeState({
				candles: [baseCandle(), baseCandle({ close: Price.of(105) })],
			});

			const f = buildFeatures({
				state: s,
				idx: 1,
			});
			expect(f.toFloat32Array()[17]).toBe(1.0);
		});
	});
});
