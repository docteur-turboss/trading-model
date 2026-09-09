import { beforeEach, describe, expect, it } from "@jest/globals";
import type { NeuralNetworkConfig } from "../../../src/core/neural-network/type";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
} from "../../../src/core/neural-network/type";
import { NeuralNetwork } from "../../../src/domain/neural-network/neural-network";

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

describe("NeuralNetwork", () => {
	describe("constructor", () => {
		it("should create a network with valid config", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(nn.parameterCount()).toBeGreaterThan(0);
		});

		it("should throw when fewer than 2 layers are provided", () => {
			expect(
				() => new NeuralNetwork(makeConfig({ neuronsByLayer: [4] }))
			).toThrow();
		});

		it("should throw when a layer size is zero", () => {
			expect(
				() => new NeuralNetwork(makeConfig({ neuronsByLayer: [4, 0, 3] }))
			).toThrow();
		});

		it("should throw when a layer size is negative", () => {
			expect(
				() => new NeuralNetwork(makeConfig({ neuronsByLayer: [4, -2, 3] }))
			).toThrow();
		});

		it("should throw when activationType length does not match layer count", () => {
			expect(
				() =>
					new NeuralNetwork(
						makeConfig({
							activationType: [
								ActivationType.Relu,
								ActivationType.Tanh,
								ActivationType.Sigmoid,
							],
						})
					)
			).toThrow();
		});

		it("should throw when softmax output is not paired with cross-entropy loss", () => {
			expect(
				() =>
					new NeuralNetwork(
						makeConfig({
							activationType: [ActivationType.Relu, ActivationType.Softmax],
							lossFunctionType: LossFunctionType.MeanSquaredError,
						})
					)
			).toThrow();
		});

		it("should warn when sigmoid output is not paired with binary cross-entropy", () => {
			const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			new NeuralNetwork(
				makeConfig({
					activationType: [ActivationType.Relu, ActivationType.Sigmoid],
					lossFunctionType: LossFunctionType.MeanSquaredError,
				})
			);

			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it("should use default values when optional fields are omitted", () => {
			const nn = new NeuralNetwork({ neuronsByLayer: [3, 2] });

			expect(nn.parameterCount()).toBe(8);
		});
	});

	describe("forward", () => {
		let nn: NeuralNetwork;

		beforeEach(() => {
			nn = new NeuralNetwork(makeConfig());
		});

		it("should return output matching the output layer dimension", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = nn.forward(input);

			expect(result.output.length).toBe(3);
		});

		it("should throw when input size does not match input dimension", () => {
			const input = new Float32Array([1, 2, 3]);
			expect(() => nn.forward(input)).toThrow();
		});

		it("should return a ForwardContext with output field", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = nn.forward(input);

			expect(result).toHaveProperty("input");
			expect(result).toHaveProperty("output");
			expect(result).toHaveProperty("layerZValues");
			expect(result).toHaveProperty("layerOutputs");
		});

		it("should include all intermediate layer activations", () => {
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = nn.forward(input);

			expect(result.layerOutputs.length).toBe(2);
			expect(result.layerOutputs[0].length).toBe(6);
			expect(result.layerOutputs[1].length).toBe(3);
		});
	});

	describe("predict", () => {
		it("should return only the output vector", () => {
			const nn = new NeuralNetwork(makeConfig());
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);

			const result = nn.predict(input);

			expect(result.length).toBe(3);
		});
	});

	describe("train", () => {
		it("should return a finite loss value", () => {
			const nn = new NeuralNetwork(makeConfig({ learningRate: 0.01 }));
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const target = new Float32Array([1, 0, 0]);

			const loss = nn.train(input, target);

			expect(typeof loss).toBe("number");
			expect(Number.isFinite(loss)).toBe(true);
		});

		it("should throw when input size mismatches", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(() =>
				nn.train(new Float32Array([1, 2]), new Float32Array([1, 0, 0]))
			).toThrow();
		});

		it("should throw when target size mismatches", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(() =>
				nn.train(
					new Float32Array([0.5, -0.3, 0.1, 0.8]),
					new Float32Array([1, 0])
				)
			).toThrow();
		});

		it("should clip gradients when norm exceeds gradientClipNorm", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [1, 1],
				activationType: [ActivationType.Relu],
				initialisationType: InitialisationType.Zeros,
				lossFunctionType: LossFunctionType.MeanSquaredError,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.FullyConnected,
				useBias: false,
				gradientClipNorm: 1,
			});
			nn.setWeights(new Float32Array([100, 0]));
			const input = new Float32Array([1000]);
			const target = new Float32Array([0]);

			const loss = nn.train(input, target);

			expect(Number.isFinite(loss)).toBe(true);
		});
	});

	describe("getWeights / setWeights", () => {
		it("should return a Float32Array", () => {
			const nn = new NeuralNetwork(makeConfig());

			const weights = nn.getWeights();

			expect(weights).toBeInstanceOf(Float32Array);
		});

		it("parameterCount should match getWeights length", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(nn.parameterCount()).toBe(nn.getWeights().length);
		});

		it("setWeights should restore weights identical to getWeights", () => {
			const nn = new NeuralNetwork(makeConfig());
			const original = nn.getWeights();

			const copy = new Float32Array(original);
			nn.setWeights(copy);

			const restored = nn.getWeights();
			for (let i = 0; i < original.length; i++) {
				expect(restored[i]).toBe(original[i]);
			}
		});

		it("setWeights should throw on buffer length mismatch", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(() => nn.setWeights(new Float32Array(5))).toThrow();
		});
	});

	describe("distributeAroundWeights", () => {
		it("should accept a scalar reference", () => {
			const nn = new NeuralNetwork(makeConfig());

			nn.distributeAroundWeights(0, 0.01);

			expect(nn.parameterCount()).toBeGreaterThan(0);
		});

		it("should accept scalar reference with default sigma", () => {
			const nn = new NeuralNetwork(makeConfig());

			nn.distributeAroundWeights(0);

			expect(nn.parameterCount()).toBeGreaterThan(0);
		});

		it("should accept a non-zero scalar reference", () => {
			const nn = new NeuralNetwork(makeConfig());

			nn.distributeAroundWeights(0.5, 0.01);

			expect(nn.parameterCount()).toBeGreaterThan(0);
		});

		it("should accept a network reference", () => {
			const nn = new NeuralNetwork(makeConfig());
			const reference = new NeuralNetwork(makeConfig());

			nn.distributeAroundWeights(reference, 0.01);

			expect(nn.parameterCount()).toBeGreaterThan(0);
		});

		it("should throw when reference network has different parameter count", () => {
			const nn = new NeuralNetwork(makeConfig());
			const reference = new NeuralNetwork(
				makeConfig({
					neuronsByLayer: [4, 3],
					activationType: [ActivationType.Relu],
				})
			);

			expect(() => nn.distributeAroundWeights(reference, 0.01)).toThrow();
		});
	});

	describe("pool operations", () => {
		it("forwardAndPool should throw when pool is disabled", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: false }));
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const target = new Float32Array([1, 0, 0]);

			expect(() => nn.forwardAndPool(input, target)).toThrow();
		});

		it("forwardAndPool should store experience in pool", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const target = new Float32Array([1, 0, 0]);

			nn.forwardAndPool(input, target);

			expect(nn.getPoolSize()).toBe(1);
		});

		it("trainPooled should return 0 when pool is empty", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));

			const loss = nn.trainPooled();

			expect(loss).toBe(0);
		});

		it("trainPooled should throw when pool is disabled", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: false }));

			expect(() => nn.trainPooled()).toThrow();
		});

		it("trainPooled should clear pool after training", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const target = new Float32Array([1, 0, 0]);
			nn.forwardAndPool(input, target);

			nn.trainPooled();

			expect(nn.getPoolSize()).toBe(0);
		});

		it("trainPooled should return finite loss", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));
			nn.forwardAndPool(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				new Float32Array([1, 0, 0])
			);
			const loss = nn.trainPooled();
			expect(Number.isFinite(loss)).toBe(true);
		});

		it("clearPool should remove all experiences", () => {
			const nn = new NeuralNetwork(makeConfig({ enablePool: true }));
			nn.forwardAndPool(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				new Float32Array([1, 0, 0])
			);

			nn.clearPool();

			expect(nn.getPoolSize()).toBe(0);
		});
	});

	describe("single layer network", () => {
		it("should handle input-to-output direct connection", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4, 2],
				activationType: [ActivationType.Sigmoid],
				initialisationType: InitialisationType.Zeros,
				lossFunctionType: LossFunctionType.BinaryCrossEntropy,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.FullyConnected,
				enablePool: false,
			});

			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = nn.forward(input);

			expect(result.output.length).toBe(2);
		});
	});

	describe("softmax activation", () => {
		it("should produce non-equal Z values with random init covering max-finding branch", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4, 3],
				activationType: [ActivationType.Softmax],
				initialisationType: InitialisationType.Random,
				lossFunctionType: LossFunctionType.CrossEntropy,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.FullyConnected,
				enablePool: false,
			});

			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = nn.forward(input);

			expect(result.output.length).toBe(3);
			const sum = result.output.reduce((s, v) => s + v, 0);
			expect(sum).toBeCloseTo(1, 3);
		});
	});

	describe("useBias disabled", () => {
		it("should create network with bias disabled", () => {
			const nn = new NeuralNetwork(makeConfig({ useBias: false }));
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);

			const result = nn.forward(input);

			expect(result.output.length).toBe(3);
		});

		it("should train pooled without bias", () => {
			const nn = new NeuralNetwork(
				makeConfig({ useBias: false, enablePool: true })
			);
			nn.forwardAndPool(
				new Float32Array([0.5, -0.3, 0.1, 0.8]),
				new Float32Array([1, 0, 0])
			);
			const loss = nn.trainPooled();
			expect(Number.isFinite(loss)).toBe(true);
		});
	});

	describe("dense-skip connection", () => {
		it("should add skip connection when input matches output size", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4, 4],
				activationType: [ActivationType.Relu],
				initialisationType: InitialisationType.Zeros,
				lossFunctionType: LossFunctionType.MeanSquaredError,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.DenseSkip,
				enablePool: false,
			});

			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const result = nn.forward(input);

			expect(result.output.length).toBe(4);
		});
	});
});
