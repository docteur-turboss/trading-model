import { describe, expect, test } from "@jest/globals";
import { ACTIVATIONS } from "../../../src/core/neural-network/activation";

describe("Activation Functions", () => {
	describe("sigmoid", () => {
		test("fn should return 0.5 for input 0", () => {
			expect(ACTIVATIONS.sigmoid.fn(0)).toBeCloseTo(0.5, 5);
		});

		test("fn should approach 1 for large positive input", () => {
			expect(ACTIVATIONS.sigmoid.fn(10)).toBeCloseTo(1, 4);
		});

		test("fn should approach 0 for large negative input", () => {
			expect(ACTIVATIONS.sigmoid.fn(-10)).toBeCloseTo(0, 4);
		});

		test("derivative should be a*(1-a)", () => {
			expect(ACTIVATIONS.sigmoid.derivative(0.5, 0)).toBeCloseTo(0.25, 5);
		});
	});

	describe("tanh", () => {
		test("fn should return 0 for input 0", () => {
			expect(ACTIVATIONS.tanh.fn(0)).toBe(0);
		});

		test("fn should approach 1 for large positive input", () => {
			expect(ACTIVATIONS.tanh.fn(10)).toBeCloseTo(1, 4);
		});

		test("derivative should be 1 - a^2", () => {
			expect(ACTIVATIONS.tanh.derivative(0.5, 0)).toBeCloseTo(0.75, 5);
		});
	});

	describe("relu", () => {
		test("fn should return 0 for negative input", () => {
			expect(ACTIVATIONS.relu.fn(-5)).toBe(0);
		});

		test("fn should return input for positive input", () => {
			expect(ACTIVATIONS.relu.fn(5)).toBe(5);
		});

		test("derivative should be 1 for positive z", () => {
			expect(ACTIVATIONS.relu.derivative(5, 3)).toBe(1);
		});

		test("derivative should be 0 for negative z", () => {
			expect(ACTIVATIONS.relu.derivative(0, -3)).toBe(0);
		});
	});

	describe("leakyReLu", () => {
		test("fn should return input for positive input", () => {
			expect(ACTIVATIONS.leakyReLu.fn(5)).toBe(5);
		});

		test("fn should return 0.01*x for negative input", () => {
			expect(ACTIVATIONS.leakyReLu.fn(-5)).toBeCloseTo(-0.05, 5);
		});

		test("derivative should be 1 for positive z", () => {
			expect(ACTIVATIONS.leakyReLu.derivative(5, 3)).toBe(1);
		});

		test("derivative should be 0.01 for negative z", () => {
			expect(ACTIVATIONS.leakyReLu.derivative(0, -3)).toBe(0.01);
		});
	});

	describe("elu", () => {
		test("fn should return input for non-negative input", () => {
			expect(ACTIVATIONS.elu.fn(5)).toBe(5);
		});

		test("fn should return 0.01*(exp(x)-1) for negative input", () => {
			const result = ACTIVATIONS.elu.fn(-1);
			expect(result).toBeCloseTo(0.01 * (Math.exp(-1) - 1), 5);
		});

		test("derivative should be 1 for positive z", () => {
			expect(ACTIVATIONS.elu.derivative(5, 2)).toBe(1);
		});

		test("derivative should be 0.01*exp(z) for negative z", () => {
			const result = ACTIVATIONS.elu.derivative(0, -1);
			expect(result).toBeCloseTo(0.01 * Math.exp(-1), 5);
		});
	});

	describe("gelu", () => {
		test("fn should return finite value for positive input", () => {
			expect(Number.isFinite(ACTIVATIONS.gelu.fn(1))).toBe(true);
		});

		test("fn should return finite value for negative input", () => {
			expect(Number.isFinite(ACTIVATIONS.gelu.fn(-1))).toBe(true);
		});

		test("fn should be roughly 0 for 0", () => {
			expect(ACTIVATIONS.gelu.fn(0)).toBeCloseTo(0, 1);
		});

		test("derivative should be finite", () => {
			expect(Number.isFinite(ACTIVATIONS.gelu.derivative(1, 1))).toBe(true);
		});
	});

	describe("mish", () => {
		test("fn should return finite value for positive input", () => {
			expect(Number.isFinite(ACTIVATIONS.mish.fn(1))).toBe(true);
		});

		test("fn should return finite value for negative input", () => {
			expect(Number.isFinite(ACTIVATIONS.mish.fn(-1))).toBe(true);
		});

		test("derivative should be finite", () => {
			expect(Number.isFinite(ACTIVATIONS.mish.derivative(1, 1))).toBe(true);
		});
	});

	describe("softmax", () => {
		test("fn should throw when called directly (use ActivationComputer.applySoftmax instead)", () => {
			expect(() => ACTIVATIONS.softmax.fn(5)).toThrow();
		});

		test("derivative should throw when called directly (use OutputDeltaComputer instead)", () => {
			expect(() => ACTIVATIONS.softmax.derivative(0, 0)).toThrow();
		});
	});
});
