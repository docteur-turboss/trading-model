import { describe, expect, it, jest } from "@jest/globals";
import type { MarketStep } from "../../../src/domain/genetic-algorithm/genome-fitness";
import type { MarketDataContext } from "../../../src/domain/market-data/market-data-context";
import {
	DEFAULT_VALIDATION_SPLIT,
	MIN_TRAINING_STEPS,
	WindowSplitter,
} from "../../../src/domain/market-data/window-splitter";

/** Steps with strictly increasing timestamps 0..n-1 (timestamp == index). */
const makeSteps = (n: number): MarketStep[] =>
	Array.from({ length: n }, (_, i) => ({
		price: 1 as never,
		features: [] as never,
		timestamp: i,
	}));

const ts = (steps: MarketStep[]): number[] =>
	steps.map((s) => s.timestamp as number);

/** Deterministic LCG, no Math.random. */
const lcg = (seed: number) => () => {
	seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
	return seed / 2 ** 32;
};

const splitter = () => new WindowSplitter(new Map());

/** Asserts invariants 1-4 of the walk-forward split for one input. */
function expectWalkForwardInvariants(n: number, folds: number): void {
	const steps = makeSteps(n);
	const windows = splitter().splitWalkForward(steps, folds);
	expect(windows).toHaveLength(folds - 1);
	let prevTrainLen = 0;
	let prevValEnd = -1;
	for (const w of windows) {
		const trainTs = ts(w.train);
		const valTs = ts(w.validation);
		expect(trainTs[0]).toBe(0);
		expect(Math.max(...trainTs)).toBeLessThan(Math.min(...valTs));
		expect(valTs[0]).toBe(trainTs[trainTs.length - 1] + 1);
		if (prevValEnd >= 0) {
			expect(valTs[0]).toBe(prevValEnd + 1);
		}
		expect(w.train.length).toBeGreaterThan(prevTrainLen);
		prevTrainLen = w.train.length;
		prevValEnd = valTs[valTs.length - 1];
	}
}

describe("WindowSplitter.splitWalkForward", () => {
	it("returns exactly folds-1 windows", () => {
		for (const folds of [2, 3, 5, 20]) {
			const w = splitter().splitWalkForward(makeSteps(10 * folds), folds);
			expect(w).toHaveLength(folds - 1);
		}
	});

	it("keeps every training timestamp strictly before every validation timestamp", () => {
		for (const w of splitter().splitWalkForward(makeSteps(100), 5)) {
			expect(Math.max(...ts(w.train))).toBeLessThan(
				Math.min(...ts(w.validation))
			);
		}
	});

	it("starts each validation right after its training and after the previous validation", () => {
		const w = splitter().splitWalkForward(makeSteps(100), 5);
		w.forEach((win, k) => {
			expect(win.validation[0].timestamp).toBe(
				(win.train[win.train.length - 1].timestamp as number) + 1
			);
			if (k > 0) {
				const prev = w[k - 1].validation;
				expect(win.validation[0].timestamp).toBe(
					(prev[prev.length - 1].timestamp as number) + 1
				);
			}
		});
	});

	it("grows the training set strictly and always starts it at step 0", () => {
		const w = splitter().splitWalkForward(makeSteps(100), 5);
		w.forEach((win, k) => {
			expect(win.train[0].timestamp).toBe(0);
			if (k > 0) {
				expect(win.train.length).toBeGreaterThan(w[k - 1].train.length);
			}
		});
	});

	it("gives unique ids with the wf_window_ prefix", () => {
		const ids = splitter()
			.splitWalkForward(makeSteps(100), 5)
			.map((w) => w.id);
		for (const id of ids) {
			expect(id).toMatch(/^wf_window_/);
		}
		expect(new Set(ids).size).toBe(ids.length);
	});

	it.each([[0], [1]])(
		"falls back to one default split when folds=%i",
		(folds) => {
			const w = splitter().splitWalkForward(makeSteps(100), folds);
			expect(w).toHaveLength(1);
			expect(w[0].id).toMatch(/^window_/);
			expect(w[0].train).toHaveLength(
				Math.floor(100 * (1 - DEFAULT_VALIDATION_SPLIT))
			);
		}
	);

	it.each([[2], [4]])(
		"falls back below MIN_TRAINING_STEPS*folds and walks forward at it (folds=%i)",
		(folds) => {
			const min = MIN_TRAINING_STEPS * folds;
			const below = splitter().splitWalkForward(makeSteps(min - 1), folds);
			expect(below).toHaveLength(1);
			expect(below[0].id).toMatch(/^window_/);
			const at = splitter().splitWalkForward(makeSteps(min), folds);
			expect(at).toHaveLength(folds - 1);
			expect(at[0].id).toMatch(/^wf_window_/);
		}
	);

	it("holds invariants 1-4 over 200 seeded random lengths and fold counts", () => {
		const rnd = lcg(657);
		for (let i = 0; i < 200; i++) {
			const folds = 2 + Math.floor(rnd() * 19);
			const n = MIN_TRAINING_STEPS * folds + Math.floor(rnd() * 300);
			expectWalkForwardInvariants(n, folds);
		}
	});

	it("leaves the last steps.length % folds steps out of every validation (documented behavior)", () => {
		const steps = makeSteps(25);
		const windows = splitter().splitWalkForward(steps, 2);
		const validated = new Set(windows.flatMap((w) => ts(w.validation)));
		expect(windows).toHaveLength(1);
		expect(ts(windows[0].validation)).toEqual(
			Array.from({ length: 12 }, (_, i) => 12 + i)
		);
		expect(validated.has(24)).toBe(false);
	});
});

describe("WindowSplitter.getAllWindows", () => {
	const ctx = { symbol: "BTCUSDT" } as unknown as MarketDataContext;
	const withSteps = (n: number) => {
		const s = splitter();
		jest.spyOn(s, "buildMarketSteps").mockReturnValue(makeSteps(n));
		return s;
	};

	it("returns an array of windows when walkForwardFolds >= 2", () => {
		const r = withSteps(100).getAllWindows(ctx, 0.2, 4);
		expect(Array.isArray(r)).toBe(true);
		expect(r).toHaveLength(3);
	});

	it("returns a single WindowSet when walkForwardFolds is 1", () => {
		const r = withSteps(100).getAllWindows(ctx, 0.2, 1);
		expect(Array.isArray(r)).toBe(false);
		expect((r as { train: unknown[] }).train).toHaveLength(68);
	});

	it("uses the default split and a single fold when called with the context only", () => {
		const r = withSteps(100).getAllWindows(ctx);
		expect(Array.isArray(r)).toBe(false);
		expect((r as { train: unknown[] }).train).toHaveLength(72);
	});

	it("returns null with fewer than MIN_TRAINING_STEPS steps", () => {
		expect(
			withSteps(MIN_TRAINING_STEPS - 1).getAllWindows(ctx, 0.2, 3)
		).toBeNull();
	});
});
