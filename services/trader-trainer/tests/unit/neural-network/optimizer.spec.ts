import { describe, expect, test } from "@jest/globals";
import {
	type AdamState,
	DEFAULT_HYPERPARAMS,
	OPTIMIZERS,
	type RmspropState,
} from "../../../src/core/neural-network/optimizer";

describe("Optimizers", () => {
	describe("SGD", () => {
		test("initState should return { stepCount: 0 }", () => {
			const state = OPTIMIZERS.sgd.initState(10);
			expect(state.stepCount).toBe(0);
		});

		test("step should update params and increment stepCount", () => {
			const params = new Float32Array([1, 2, 3]);
			const grads = new Float32Array([0.1, 0.2, 0.3]);
			const state = OPTIMIZERS.sgd.initState(3);

			OPTIMIZERS.sgd.step({
				params,
				grads,
				state,
				lr: 0.1,
				hp: DEFAULT_HYPERPARAMS,
			});

			expect(state.stepCount).toBe(1);
			expect(params[0]).toBeCloseTo(0.99, 5);
			expect(params[1]).toBeCloseTo(1.98, 5);
			expect(params[2]).toBeCloseTo(2.97, 5);
		});
	});

	describe("Adam", () => {
		test("initState should return moment1 and moment2 arrays", () => {
			const state = OPTIMIZERS.adam.initState(5) as AdamState;
			expect(state.stepCount).toBe(0);
			expect(state.moment1.length).toBe(5);
			expect(state.moment2.length).toBe(5);
		});

		test("step should update params", () => {
			const params = new Float32Array([1, 1]);
			const grads = new Float32Array([0.5, -0.5]);
			const state = OPTIMIZERS.adam.initState(2);

			OPTIMIZERS.adam.step({
				params,
				grads,
				state,
				lr: 0.001,
				hp: DEFAULT_HYPERPARAMS,
			});

			expect(state.stepCount).toBe(1);
			expect(params[0]).not.toBe(1);
			expect(params[1]).not.toBe(1);
		});

		test("should produce finite values after multiple steps", () => {
			const params = new Float32Array([0, 0, 0]);
			const state = OPTIMIZERS.adam.initState(3);

			for (let i = 0; i < 10; i++) {
				const grads = new Float32Array([0.1, -0.2, 0.3]);
				OPTIMIZERS.adam.step({
					params,
					grads,
					state,
					lr: 0.01,
					hp: DEFAULT_HYPERPARAMS,
				});
			}

			for (const p of params) {
				expect(Number.isFinite(p)).toBe(true);
			}
		});
	});

	describe("RMSProp", () => {
		test("initState should return moment2 array", () => {
			const state = OPTIMIZERS.rmsprop.initState(5) as RmspropState;
			expect(state.stepCount).toBe(0);
			expect(state.moment2.length).toBe(5);
		});

		test("step should update params", () => {
			const params = new Float32Array([1, 1]);
			const grads = new Float32Array([0.5, -0.5]);
			const state = OPTIMIZERS.rmsprop.initState(2);

			OPTIMIZERS.rmsprop.step({
				params,
				grads,
				state,
				lr: 0.01,
				hp: DEFAULT_HYPERPARAMS,
			});

			expect(state.stepCount).toBe(1);
			expect(params[0]).toBeLessThan(1);
			expect(params[1]).toBeGreaterThan(1);
		});

		test("should produce finite values after multiple steps", () => {
			const params = new Float32Array([0, 0]);
			const state = OPTIMIZERS.rmsprop.initState(2);

			for (let i = 0; i < 10; i++) {
				const grads = new Float32Array([0.1, -0.2]);
				OPTIMIZERS.rmsprop.step({
					params,
					grads,
					state,
					lr: 0.01,
					hp: DEFAULT_HYPERPARAMS,
				});
			}

			for (const p of params) {
				expect(Number.isFinite(p)).toBe(true);
			}
		});
	});
});
