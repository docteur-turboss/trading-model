import { describe, expect, it } from "@jest/globals";
import type { NeuralNetworkConfig } from "@trading-model/model-runtime/neural-network/type";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "@trading-model/model-runtime/neural-network/type";
import type {
	Percentage,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import { NeuralNetwork } from "../../../../src/domain/neural-network/neural-network";

function makeConfig(
	overrides?: Partial<NeuralNetworkConfig>
): NeuralNetworkConfig {
	return {
		neuronsByLayer: [4 as PositiveInt, 6 as PositiveInt, 3 as PositiveInt],
		activationType: [ActivationType.Relu, ActivationType.Sigmoid],
		initialisationType: InitialisationType.Zeros,
		normalisationType: NormalisationType.None,
		connectionType: ConnectionType.FullyConnected,
		...overrides,
	};
}

describe("NeuralNetwork - Edge Cases", () => {
	describe("gradient clipping", () => {
		it("should clip large gradients", () => {
			const nn = new NeuralNetwork(
				makeConfig({ gradientClipNorm: 1.0, learningRate: 0.01 as Percentage })
			);
			const input = new Float32Array([100, -200, 300, -400]);
			const target = new Float32Array([1, 0, 0]);

			const loss = nn.trainFrom(nn.forward(input), target);
			expect(Number.isFinite(loss)).toBe(true);
		});

		it("should work with gradientClipNorm set to 0", () => {
			const nn = new NeuralNetwork(
				makeConfig({ gradientClipNorm: 0, learningRate: 0.01 as Percentage })
			);
			const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
			const target = new Float32Array([1, 0, 0]);

			const loss = nn.trainFrom(nn.forward(input), target);
			expect(Number.isFinite(loss)).toBe(true);
		});
	});

	describe("train with input/target mismatch", () => {
		it("train should throw on input size mismatch", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(() => {
				nn.trainFrom(
					nn.forward(new Float32Array([1, 2])),
					new Float32Array([1, 0, 0])
				);
			}).toThrow();
		});

		it("train should throw on target size mismatch", () => {
			const nn = new NeuralNetwork(makeConfig());

			expect(() => {
				nn.trainFrom(
					nn.forward(new Float32Array([0.5, -0.3, 0.1, 0.8])),
					new Float32Array([1, 0])
				);
			}).toThrow();
		});
	});

	describe("dense-skip with matching size", () => {
		it("should add skip connection output", () => {
			const nn = new NeuralNetwork({
				neuronsByLayer: [4 as PositiveInt, 4 as PositiveInt],
				activationType: [ActivationType.Relu],
				initialisationType: InitialisationType.Zeros,
				normalisationType: NormalisationType.None,
				connectionType: ConnectionType.DenseSkip,
			});

			const input = new Float32Array([1, 2, 3, 4]);
			const result = nn.forward(input);
			expect(result.output.length).toBe(4);
			expect(result.output[0]).toBe(input[0]);
		});
	});
});
