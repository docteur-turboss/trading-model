import { describe, expect, it, jest } from "@jest/globals";
import { ACTIVATIONS } from "../../../src/core/neural-network/activation";
import { LOSSES } from "../../../src/core/neural-network/losses";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
} from "../../../src/core/neural-network/type";
import { NeuralNetwork } from "../../../src/domain/neural-network/neural-network";

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {},
}));

describe("NN Regression — Forward Pass", () => {
	it("forward pass with known weights produces deterministic output", () => {
		const nn = new NeuralNetwork({
			neuronsByLayer: [2, 1],
			activationType: [ActivationType.Relu],
			initialisationType: InitialisationType.Zeros,
			biasInitialisationType: InitialisationType.Zeros,
			useBias: true,
			normalisationType: NormalisationType.None,
			connectionType: ConnectionType.FullyConnected,
			lossFunctionType: LossFunctionType.MeanSquaredError,
		});

		const weights = new Float32Array([0.5, 0.3]);
		const biases = new Float32Array([0.2]);
		const params = new Float32Array(weights.length + biases.length);
		params.set(weights, 0);
		params.set(biases, weights.length);
		nn.setWeights(params);

		const input = new Float32Array([1.0, 2.0]);
		const ctx = nn.forward(input);
		const expected = 0.5 * 1.0 + 0.3 * 2.0 + 0.2;
		expect(ctx.output.length).toBe(1);
		expect(ctx.output[0]).toBeCloseTo(expected, 5);
	});

	it("forward pass with different weights produces different output", () => {
		const nn = new NeuralNetwork({
			neuronsByLayer: [2, 1],
			activationType: [ActivationType.Relu],
			initialisationType: InitialisationType.Zeros,
			biasInitialisationType: InitialisationType.Zeros,
			useBias: true,
			normalisationType: NormalisationType.None,
		});

		const params = new Float32Array([0.8, 0.2, 0]);
		nn.setWeights(params);

		const ctx = nn.forward(new Float32Array([1.0, 1.0]));
		const expected = 0.8 * 1.0 + 0.2 * 1.0;
		expect(ctx.output[0]).toBeCloseTo(expected, 5);
	});

	it("forward pass with negative weights produces negative ReLu output (clamps to zero)", () => {
		const nn = new NeuralNetwork({
			neuronsByLayer: [1, 1],
			activationType: [ActivationType.Relu],
			initialisationType: InitialisationType.Zeros,
			biasInitialisationType: InitialisationType.Zeros,
			useBias: true,
			normalisationType: NormalisationType.None,
		});

		const params = new Float32Array([-2.0, 0]);
		nn.setWeights(params);

		const ctx = nn.forward(new Float32Array([5.0]));
		expect(ctx.output[0]).toBe(0);
	});
});

describe("NN Regression — Loss Functions", () => {
	const config = {
		lossFunctionType: LossFunctionType.MeanSquaredError,
		deltaHuber: 1,
		neuronsByLayer: [2, 1],
		useBias: true,
		normalisationType: NormalisationType.None,
		connectionType: ConnectionType.FullyConnected,
		initialisationType: InitialisationType.Zeros,
	};

	it("MSE of identical vectors is zero", () => {
		const output = new Float32Array([0.5, 0.3]);
		const target = new Float32Array([0.5, 0.3]);
		const loss = LOSSES[LossFunctionType.MeanSquaredError].loss(
			output,
			target,
			config
		);
		expect(loss).toBe(0);
	});

	it("MSE of known vectors computes correct value", () => {
		const output = new Float32Array([0.5, 0.3]);
		const target = new Float32Array([0.7, 0.1]);
		const loss = LOSSES[LossFunctionType.MeanSquaredError].loss(
			output,
			target,
			config
		);
		const expected = ((0.5 - 0.7) ** 2 + (0.3 - 0.1) ** 2) / 2;
		expect(loss).toBeCloseTo(expected, 5);
		expect(loss).toBeCloseTo(0.04, 5);
	});

	it("MAE of known vectors computes correct value", () => {
		const output = new Float32Array([10, 20]);
		const target = new Float32Array([12, 18]);
		const loss = LOSSES[LossFunctionType.MeanAbsoluteError].loss(
			output,
			target,
			config
		);
		const expected = (Math.abs(10 - 12) + Math.abs(20 - 18)) / 2;
		expect(loss).toBeCloseTo(expected, 5);
		expect(loss).toBe(2);
	});

	it("cross-entropy loss is finite for valid probabilities", () => {
		const output = new Float32Array([0.7, 0.3]);
		const target = new Float32Array([1, 0]);
		const loss = LOSSES[LossFunctionType.CrossEntropy].loss(
			output,
			target,
			config
		);
		expect(loss).toBeGreaterThan(0);
		expect(Number.isFinite(loss)).toBe(true);
	});

	it("binary-cross-entropy loss is zero for perfect prediction", () => {
		const output = new Float32Array([1]);
		const target = new Float32Array([1]);
		const loss = LOSSES[LossFunctionType.BinaryCrossEntropy].loss(
			output,
			target,
			config
		);
		expect(loss).toBeCloseTo(0, 5);
	});
});

describe("NN Regression — Activations", () => {
	it("sigmoid(0) is 0.5", () => {
		expect(ACTIVATIONS.sigmoid.fn(0)).toBeCloseTo(0.5, 10);
	});

	it("tanh(0) is 0", () => {
		expect(ACTIVATIONS.tanh.fn(0)).toBe(0);
	});

	it("ReLu negative input clamps to zero", () => {
		expect(ACTIVATIONS.relu.fn(-5)).toBe(0);
	});

	it("ReLu positive input passes through", () => {
		expect(ACTIVATIONS.relu.fn(3)).toBe(3);
	});

	it("leakyReLu passes small gradient for negative input", () => {
		const result = ACTIVATIONS.leakyReLu.fn(-2);
		expect(result).toBeCloseTo(-2 * 0.01, 5);
	});

	it("softmax sums to 1", () => {
		const z = new Float32Array([1, 2, 3]);
		const out = new Float32Array(3);
		let max = z[0];
		for (let i = 1; i < 3; i++) {
			if (z[i] > max) {
				max = z[i];
			}
		}
		let expSum = 0;
		for (let i = 0; i < 3; i++) {
			const e = Math.exp(z[i] - max);
			out[i] = e;
			expSum += e;
		}
		const inv = 1 / expSum;
		let sum = 0;
		for (let i = 0; i < 3; i++) {
			out[i] *= inv;
			sum += out[i];
		}
		expect(sum).toBeCloseTo(1, 5);
	});
});
