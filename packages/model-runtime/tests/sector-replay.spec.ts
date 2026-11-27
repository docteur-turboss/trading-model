import { describe, expect, it } from "@jest/globals";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { FEATURE_DIM } from "../src/feature-vector-codec";
import { ActivationType, NormalisationType } from "../src/neural-network/type";
import type { PolicyGenome } from "../src/replay";
import {
	managerInputDim,
	type PoolingMode,
	poolSignals,
	replaySector,
	SIGNAL_DIM,
	sectorDecision,
	toAssetSignal,
} from "../src/sector-replay";

const T0 = 1_700_000_000_000;
const candlesOf = (phase: number): CandleData[] =>
	Array.from({ length: 300 }, (_, idx) => {
		const price = 100 + 8 * Math.sin(idx / 5 + phase) + idx / 20;
		return {
			timestamp: T0 + idx * 60_000,
			closeTimestamp: T0 + idx * 60_000 + 59_999,
			open: price - 0.3,
			high: price + 1,
			low: price - 1,
			close: price,
			volume: 1000 + 300 * Math.cos(idx + phase),
		} as unknown as CandleData;
	});
const SIMULATOR = {
	initialCash: 1000,
	feeRate: 0.001,
	executionCostRate: 0.0005,
	tradeFraction: 0.1,
	observePosition: false,
};

function network(inputDim: number, outputDim: number, seed: number) {
	const hidden = 3;
	const genome = {
		network: {
			inputDim,
			outputDim,
			hiddenLayers: [{ neurons: hidden, activation: ActivationType.Tanh }],
			normalization: NormalisationType.None,
		},
		rl: { horizon: { frameSkip: 1 } },
	} as PolicyGenome;
	const size = inputDim * hidden + hidden + hidden * outputDim + outputDim;
	return {
		genome,
		weights: Float32Array.from({ length: size }, (_, idx) =>
			Math.sin(idx * 1.3 + seed)
		),
	};
}

const run = (pooling: PoolingMode, assets = 3) =>
	replaySector({
		assets: Array.from({ length: assets }, (_, idx) => ({
			symbol: `A${idx}`,
			analyst: network(FEATURE_DIM, SIGNAL_DIM, idx),
			candles: candlesOf(idx),
		})),
		manager: network(managerInputDim(pooling), 2, 9),
		pooling,
		testFrom: T0 + 60 * 60_000,
		simulator: SIMULATOR,
	});

describe("sector replay (ADR-0076 step 4)", () => {
	it("bounds the signal and pools mean and max", () => {
		const a = toAssetSignal([5, 0, 0, 0, 0]);
		const b = toAssetSignal([-5, 0, 0, 0, 0]);
		expect(a.score).toBeGreaterThan(0.99);
		expect(a.confidence).toBe(0.5);
		const mean = poolSignals([a, b], "mean");
		const both = poolSignals([a, b], "mean+max");
		expect(mean[0]).toBeCloseTo(0, 6);
		expect(both).toHaveLength(managerInputDim("mean+max") - SIGNAL_DIM);
		expect(both[SIGNAL_DIM]).toBe(a.score);
		expect(() => toAssetSignal([1])).toThrow("analyst outputs 5");
	});

	it("gives weights summing to 1 and an exposure in (0, 1)", () => {
		const { weights, exposure } = sectorDecision([
			[2, 0],
			[0, 1],
			[-1, -1],
		]);
		expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 10);
		expect(weights[0]).toBeGreaterThan(weights[2]);
		expect(exposure).toBeGreaterThan(0);
		expect(exposure).toBeLessThan(1);
	});

	it.each(["mean", "mean+max"] as const)(
		"replays deterministically and pays costs (%s)",
		(pooling) => {
			const ratios = run(pooling);
			expect(Number.isFinite(ratios.sharpe)).toBe(true);
			expect(ratios.feesPaid).toBeGreaterThan(0);
			expect(run(pooling)).toEqual(ratios);
		}
	);

	it("refuses a manager that does not fit the pooling mode, or assets sharing no bar", () => {
		const assets = [
			{
				symbol: "A0",
				analyst: network(FEATURE_DIM, SIGNAL_DIM, 0),
				candles: candlesOf(0),
			},
		];
		const base = {
			assets,
			pooling: "mean" as const,
			testFrom: T0,
			simulator: SIMULATOR,
		};
		expect(() => replaySector({ ...base, manager: network(15, 2, 0) })).toThrow(
			"pooling mode"
		);
		expect(() =>
			replaySector({
				...base,
				manager: network(10, 2, 0),
				testFrom: T0 + 1e9,
			})
		).toThrow("fewer than 2 bars");
	});
});

describe("attention pooling", () => {
	it("sizes the manager input from the heads and refuses missing weights", () => {
		expect(managerInputDim("attention", 2)).toBe(15);
		const signal = toAssetSignal([0, 0, 0, 0, 0]);
		expect(() => poolSignals([signal], "attention")).toThrow(/heads/);
		expect(
			poolSignals([signal], "attention", {
				heads: 1,
				weights: new Float32Array(75),
			})
		).toHaveLength(5);
	});
});
