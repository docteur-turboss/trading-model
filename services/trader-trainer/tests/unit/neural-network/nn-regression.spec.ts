import { describe, expect, it, jest } from "@jest/globals";
import { ACTIVATIONS } from "../../../src/domain/neural-network/activation";
import { NeuralNetwork } from "../../../src/domain/neural-network/neural-network";
import { mseLoss } from "../../../src/domain/neural-network/output-delta-computer";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../../../src/domain/neural-network/type";

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

describe("NN Regression — Loss", () => {
	it("MSE of identical vectors is zero", () => {
		const output = new Float32Array([0.5, 0.3]);
		expect(mseLoss(output, new Float32Array([0.5, 0.3]))).toBe(0);
	});

	it("MSE of known vectors computes correct value", () => {
		const output = new Float32Array([0.5, 0.3]);
		const target = new Float32Array([0.7, 0.1]);
		const loss = mseLoss(output, target);
		const expected = ((0.5 - 0.7) ** 2 + (0.3 - 0.1) ** 2) / 2;
		expect(loss).toBeCloseTo(expected, 5);
		expect(loss).toBeCloseTo(0.04, 5);
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
});
