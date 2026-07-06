import { describe, expect, it } from "@jest/globals";
import { NeuralNetwork } from "../../../src/core/neural-network/neural-network";
import type { NeuralNetworkConfig } from "../../../src/core/neural-network/type";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
} from "../../../src/core/neural-network/type";

function makeConfig(
	overrides?: Partial<NeuralNetworkConfig>
): NeuralNetworkConfig {
	return {
		neuronsByLayer: [4, 6, 3],
		activationType: [ActivationType.Relu, ActivationType.Sigmoid],
		initialisationType: InitialisationType.Zeros,
		lossFunctionType: LossFunctionType.MeanSquaredError,
		normalisationType: NormalisationType.None,
		connectionType: ConnectionType.FullyConnected,
		enablePool: false,
		...overrides,
	};
}

describe("NeuralNetwork - Edge Cases", () => {
	describe("softmax with cross-entropy", () => {
		it("should forward softmax output that sums to ~1", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4, 3],
				activationType: [ActivationType.Softmax],
				initialisationType: InitialisationType.Zeros,
				lossFunctionType: LossFunctionType.CrossEntropy,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.FullyConnected,
				enablePool: false,
			});

			const input = new Float32Array([1, 2, 3, 4]);
			const result = nn.forward(input);
			const sum = Array.from(result.output).reduce((s, v) => s + v, 0);
			expect(sum).toBeCloseTo(1, 5);
		});

		it("should throw when softmax is not paired with cross-entropy or binary-cross-entropy", () => {
			expect(() => {
				new NeuralNetwork({
					neuronsByLayer: [4, 3],
					activationType: [ActivationType.Softmax],
					initialisationType: InitialisationType.Zeros,
					lossFunctionType: LossFunctionType.MeanSquaredError,
					normalisationType: NormalisationType.None,
					connectionType: ConnectionType.FullyConnected,
					enablePool: false,
				});
			}).toThrow();
		});

		it("should train with softmax and cross-entropy without error", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4, 3],
				activationType: [ActivationType.Softmax],
				initialisationType: InitialisationType.Zeros,
				lossFunctionType: LossFunctionType.CrossEntropy,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.FullyConnected,
				enablePool: false,
				learningRate: 0.01,
			});

			const input = new Float32Array([1, 2, 3, 4]);
			const target = new Float32Array([1, 0, 0]);
			const loss = nn.train(input, target);
			expect(Number.isFinite(loss)).toBe(true);
		});
	});

	describe("gradient clipping", () => {
		it("should clip large gradients", () => {
			const nn = new NeuralNetwork(
				makeConfig({ gradientClipNorm: 1.0, learningRate: 0.01 })
			);
			const input = new Float32Array([100, -200, 300, -400]);
			const target = new Float32Array([1, 0, 0]);

			const loss = nn.train(input, target);
			expect(Number.isFinite(loss)).toBe(true);
		});

		it("should work with gradientClipNorm set to 0", () => {
			const nn = new NeuralNetwork(
				makeConfig({ gradientClipNorm: 0, learningRate: 0.01 })
			);
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const target = new Float32Array([1, 0, 0]);

			const loss = nn.train(input, target);
			expect(Number.isFinite(loss)).toBe(true);
		});
	});

	describe("pool with input/target mismatch", () => {
		it("forwardAndPool should throw on input size mismatch", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));

			expect(() => {
				nn.forwardAndPool(
					new Float32Array([1, 2]),
					new Float32Array([1, 0, 0])
				);
			}).toThrow();
		});

		it("forwardAndPool should throw on target size mismatch", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));

			expect(() => {
				nn.forwardAndPool(
					new Float32Array([0.5, -0.3, 0.1, 0.8]),
					new Float32Array([1, 0])
				);
			}).toThrow();
		});
	});

	describe("train with input/target mismatch", () => {
		it("train should throw on input size mismatch", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: false }));

			expect(() => {
				nn.train(new Float32Array([1, 2]), new Float32Array([1, 0, 0]));
			}).toThrow();
		});

		it("train should throw on target size mismatch", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: false }));

			expect(() => {
				nn.train(
					new Float32Array([0.5, -0.3, 0.1, 0.8]),
					new Float32Array([1, 0])
				);
			}).toThrow();
		});
	});

	describe("dense-skip with matching size", () => {
		it("should add skip connection output", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4, 4],
				activationType: [ActivationType.Relu],
				initialisationType: InitialisationType.Zeros,
				lossFunctionType: LossFunctionType.MeanSquaredError,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.DenseSkip,
				enablePool: false,
			});

			const input = new Float32Array([1, 2, 3, 4]);
			const result = nn.forward(input);
			expect(result.output.length).toBe(4);
			expect(result.output[0]).toBe(input[0]);
		});
	});

	describe("pool FIFO eviction", () => {
		it("should evict oldest experiences when pool exceeds max size", () => {
			const nn = new NeuralNetwork(
				makeConfig({ enablePool: true, poolMaxSize: 2 })
			);
			nn.forwardAndPool(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				new Float32Array([1, 0, 0])
			);
			nn.forwardAndPool(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				new Float32Array([1, 0, 0])
			);
			nn.forwardAndPool(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				new Float32Array([1, 0, 0])
			);

			expect(nn.getPoolSize()).toBe(2);
		});
	});
});
