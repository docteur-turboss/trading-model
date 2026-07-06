import { describe, expect, test } from "@jest/globals";
import { LOSSES } from "../../../src/core/neural-network/losses";
import type { NeuralNetworkConfig } from "../../../src/core/neural-network/type";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "../../../src/core/neural-network/type";

function makeConfig(
	_overrides?: Partial<NeuralNetworkConfig>
): Required<NeuralNetworkConfig> {
	return {
		neuronsByLayer: [4, 6, 3],
		activationType: [ActivationType.Relu, ActivationType.Sigmoid],
		initialisationType: InitialisationType.Zeros,
		lossFunctionType: LossFunctionType.MeanSquaredError,
		normalisationType: NormalisationType.None,
		connectionType: ConnectionType.FullyConnected,
		enablePool: false,
		learningRate: 0.01,
		useBias: true,
		deltaHuber: 1,
		poolMaxSize: 10000,
		optimizerType: OptimizerType.Sgd,
		gradientClipNorm: 5.0,
		biasMutationScale: 0.05,
		weightMutationScale: 0.1,
		optimizerHyperparams: {},
		biasInitialisationType: InitialisationType.Zeros,
		normalizedInputRange: [0, 3],
	};
}

function makeOutput(values: number[]): Float32Array {
	return new Float32Array(values);
}

function makeTarget(values: number[]): Float32Array {
	return new Float32Array(values);
}

describe("Loss Functions", () => {
	const cfg = makeConfig();
	const output = makeOutput([0.2, 0.5, 0.8]);
	const target = makeTarget([1, 0, 1]);

	describe("mean-squared-error", () => {
		test("loss should compute MSE", () => {
			const loss = LOSSES["mean-squared-error"].loss(output, target, cfg);
			expect(loss).toBeCloseTo((0.64 + 0.25 + 0.04) / 3, 5);
		});

		test("gradient should be 2*(output-target)/n", () => {
			const grad = LOSSES["mean-squared-error"].gradient(output, target, cfg);
			expect(grad[0]).toBeCloseTo((2 * (0.2 - 1)) / 3, 5);
			expect(grad[1]).toBeCloseTo((2 * (0.5 - 0)) / 3, 5);
		});
	});

	describe("mean-absolute-error", () => {
		test("loss should compute MAE", () => {
			const loss = LOSSES["mean-absolute-error"].loss(output, target, cfg);
			expect(loss).toBeCloseTo((0.8 + 0.5 + 0.2) / 3, 5);
		});

		test("gradient should be sign-based", () => {
			const grad = LOSSES["mean-absolute-error"].gradient(output, target, cfg);
			expect(grad[0]).toBeCloseTo(-1 / 3, 5);
			expect(grad[1]).toBeCloseTo(1 / 3, 5);
		});

		test("gradient should be zero when output equals target", () => {
			const out = makeOutput([1, 0, 1]);
			const tgt = makeTarget([1, 0, 1]);
			const grad = LOSSES["mean-absolute-error"].gradient(out, tgt, cfg);
			expect(grad[0]).toBe(0);
			expect(grad[1]).toBe(0);
			expect(grad[2]).toBe(0);
		});
	});

	describe("root-mean-squared-error", () => {
		test("loss should compute RMSE", () => {
			const loss = LOSSES["root-mean-squared-error"].loss(output, target, cfg);
			const mse = (0.64 + 0.25 + 0.04) / 3;
			expect(loss).toBeCloseTo(Math.sqrt(mse), 5);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["root-mean-squared-error"].gradient(
				output,
				target,
				cfg
			);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});
	});

	describe("mean-biais-error", () => {
		test("loss should compute MBE", () => {
			const loss = LOSSES["mean-biais-error"].loss(output, target, cfg);
			expect(loss).toBeCloseTo((0.8 - 0.5 + 0.2) / 3, 5);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["mean-biais-error"].gradient(output, target, cfg);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});
	});

	describe("huber-loss", () => {
		test("loss should compute huber loss", () => {
			const loss = LOSSES["huber-loss"].loss(output, target, cfg);
			expect(Number.isFinite(loss)).toBe(true);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["huber-loss"].gradient(output, target, cfg);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});

		test("should handle small errors with quadratic penalty", () => {
			const near = makeOutput([0.9, 0.1, 0.9]);
			const loss = LOSSES["huber-loss"].loss(near, target, cfg);
			expect(loss).toBeLessThan(0.1);
		});

		test("should use linear penalty when error exceeds delta", () => {
			const big = makeOutput([3, 3, 3]);
			const tgt = makeTarget([1, 0, 1]);
			const loss = LOSSES["huber-loss"].loss(big, tgt, cfg);
			// errors: 2, 3, 2 — all > delta=1 => linear penalty
			// loss = (1*(2-0.5) + 1*(3-0.5) + 1*(2-0.5)) / 3 = 5.5/3
			expect(loss).toBeCloseTo(5.5 / 3, 5);
		});

		test("gradient should clip at -delta when error is below -delta", () => {
			const out = makeOutput([-3, -3, -3]);
			const tgt = makeTarget([1, 0, 1]);
			const grad = LOSSES["huber-loss"].gradient(out, tgt, cfg);
			// errors: -4, -3, -4 — all < -delta=-1 => gradient = -delta * invN = -1/3
			expect(grad[0]).toBeCloseTo(-1 / 3, 5);
			expect(grad[1]).toBeCloseTo(-1 / 3, 5);
			expect(grad[2]).toBeCloseTo(-1 / 3, 5);
		});

		test("gradient should clip at +delta when error exceeds delta", () => {
			const out = makeOutput([3, 3, 3]);
			const tgt = makeTarget([1, 0, 1]);
			const grad = LOSSES["huber-loss"].gradient(out, tgt, cfg);
			// errors: 2, 3, 2 — all > delta=1 => gradient = delta * invN = 1/3
			expect(grad[0]).toBeCloseTo(1 / 3, 5);
			expect(grad[1]).toBeCloseTo(1 / 3, 5);
			expect(grad[2]).toBeCloseTo(1 / 3, 5);
		});
	});

	describe("log-cosh-loss", () => {
		test("loss should compute log-cosh", () => {
			const loss = LOSSES["log-cosh-loss"].loss(output, target, cfg);
			expect(Number.isFinite(loss)).toBe(true);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["log-cosh-loss"].gradient(output, target, cfg);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});
	});

	describe("cross-entropy", () => {
		test("loss should compute cross-entropy", () => {
			const out = makeOutput([0.1, 0.8, 0.1]);
			const tgt = makeTarget([0, 1, 0]);
			const loss = LOSSES["cross-entropy"].loss(out, tgt, cfg);
			expect(Number.isFinite(loss)).toBe(true);
			expect(loss).toBeGreaterThan(0);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["cross-entropy"].gradient(output, target, cfg);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});
	});

	describe("binary-cross-entropy", () => {
		test("loss should compute binary cross-entropy", () => {
			const loss = LOSSES["binary-cross-entropy"].loss(output, target, cfg);
			expect(Number.isFinite(loss)).toBe(true);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["binary-cross-entropy"].gradient(output, target, cfg);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});
	});

	describe("hinge-loss", () => {
		test("loss should compute hinge loss", () => {
			const out = makeOutput([1, -1, 1]);
			const tgt = makeTarget([1, -1, 1]);
			const loss = LOSSES["hinge-loss"].loss(out, tgt, cfg);
			expect(loss).toBe(0);
		});

		test("loss should penalize wrong predictions", () => {
			const out = makeOutput([-1, 1, -1]);
			const tgt = makeTarget([1, -1, 1]);
			const loss = LOSSES["hinge-loss"].loss(out, tgt, cfg);
			expect(loss).toBeGreaterThan(0);
		});

		test("gradient should be finite", () => {
			const grad = LOSSES["hinge-loss"].gradient(output, target, cfg);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});

		test("gradient should be zero when prediction is correct", () => {
			const out = makeOutput([2, -2, 2]);
			const tgt = makeTarget([1, -1, 1]);
			const grad = LOSSES["hinge-loss"].gradient(out, tgt, cfg);
			// t*o: 2, 2, 2 — all >= 1 => gradient = 0
			expect(grad[0]).toBe(0);
			expect(grad[1]).toBe(0);
			expect(grad[2]).toBe(0);
		});
	});

	describe("Kullback-Leibler-divergence", () => {
		test("loss should compute KL divergence", () => {
			const out = makeOutput([0.1, 0.8, 0.1]);
			const tgt = makeTarget([0.2, 0.6, 0.2]);
			const loss = LOSSES["Kullback-Leibler-divergence"].loss(out, tgt, cfg);
			expect(Number.isFinite(loss)).toBe(true);
		});

		test("gradient should be finite", () => {
			const out = makeOutput([0.1, 0.8, 0.1]);
			const tgt = makeTarget([0.2, 0.6, 0.2]);
			const grad = LOSSES["Kullback-Leibler-divergence"].gradient(
				out,
				tgt,
				cfg
			);
			for (const g of grad) {
				expect(Number.isFinite(g)).toBe(true);
			}
		});
	});
});

describe("Loss function input validation", () => {
	const output = makeOutput([0.2, 0.5, 0.8]);
	const longTarget = makeTarget([1, 0, 1, 0]);
	const shortTarget = makeTarget([1]);
	const cfg = makeConfig();

	const lossNames = Object.keys(LOSSES) as Array<keyof typeof LOSSES>;

	for (const name of lossNames) {
		describe(name, () => {
			test("loss should throw on output longer than target", () => {
				expect(() => LOSSES[name].loss(output, shortTarget, cfg)).toThrow(
					RangeError
				);
			});

			test("loss should throw on output shorter than target", () => {
				const short = makeOutput([0.2]);
				expect(() => LOSSES[name].loss(short, longTarget, cfg)).toThrow(
					RangeError
				);
			});

			test("gradient should throw on output longer than target", () => {
				expect(() => LOSSES[name].gradient(output, shortTarget, cfg)).toThrow(
					RangeError
				);
			});

			test("gradient should throw on output shorter than target", () => {
				const short = makeOutput([0.2]);
				expect(() => LOSSES[name].gradient(short, longTarget, cfg)).toThrow(
					RangeError
				);
			});
		});
	}
});
