import { describe, expect, test } from "@jest/globals";
import {
	decodeGenome,
	decodePopulation,
	ENCODED_DIM,
	encodeGenome,
	encodePopulation,
} from "../../../src/core/genetic-algorithm/encoding";
import {
	ENCODING_OFFSETS,
	layerOffset,
	readEncodedLayer,
	SCALAR_DIM,
} from "../../../src/core/genetic-algorithm/encoding-indices";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import type { LayerGenome } from "../../../src/core/genetic-algorithm/genome";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
} from "../../../src/core/genetic-algorithm/genome";

function layerNeurons(arr: Float32Array, layerIdx: number): number {
	return readEncodedLayer(arr, layerOffset(layerIdx)).neurons;
}

function layerActivation(arr: Float32Array, layerIdx: number): ActivationType {
	return readEncodedLayer(arr, layerOffset(layerIdx)).activation;
}

function layerConnectionType(arr: Float32Array, layerIdx: number): ConnectionType {
	return readEncodedLayer(arr, layerOffset(layerIdx)).connectionType;
}

describe("encoding", () => {
	describe("encodeGenome", () => {
		test("should produce a Float32Array with correct length", () => {
			const g = createDefaultGenome("test");
			const enc = encodeGenome(g);
			expect(enc).toBeInstanceOf(Float32Array);
			expect(enc.length).toBe(ENCODED_DIM(g.network.hiddenLayers.length));
		});

		test("should encode gamma on the encoding array", () => {
			const g = createDefaultGenome("gamma-test");
			const enc = encodeGenome(g);
			expect(enc[ENCODING_OFFSETS.Gamma]).toBeCloseTo(g.rl.gamma, 4);
		});

		test("should encode learningRate as log-scaled in [0,1]", () => {
			const g = createDefaultGenome("lr-test");
			const enc = encodeGenome(g);
			const expected = (Math.log10(Math.max(1e-6, g.rl.learningRate)) / 6 + 1) / 2;
			expect(enc[ENCODING_OFFSETS.LearningRate]).toBeCloseTo(expected, 6);
		});

		test("should encode depth normalised by MAX_DEPTH", () => {
			const g = createDefaultGenome("depth-test");
			const enc = encodeGenome(g);
			expect(enc[ENCODING_OFFSETS.NetworkDepth]).toBeCloseTo(
				g.network.hiddenLayers.length / 12,
				4
			);
		});

		test("should encode neuron count in layer encoding", () => {
			const g = createDefaultGenome("neuron-test");
			const enc = encodeGenome(g);
			expect(layerNeurons(enc, 0)).toBe(
				g.network.hiddenLayers[0].neurons / 512
			);
		});

		test("should set one-hot for activation type in layer encoding", () => {
			const g = createDefaultGenome("oh-test");
			const enc = encodeGenome(g);
			expect(layerActivation(enc, 0)).toBe(
				g.network.hiddenLayers[0].activation
			);
		});

		test("should set one-hot for connection type in layer encoding", () => {
			const g = createDefaultGenome("oh-ct-test");
			const enc = encodeGenome(g);
			expect(layerConnectionType(enc, 0)).toBe(
				g.network.hiddenLayers[0].connectionType
			);
		});

		test("should not encode layers beyond genome depth", () => {
			const g = createDefaultGenome("pad-test");
			const enc = encodeGenome(g);
			const layerCount = enc.length - SCALAR_DIM;
			expect(layerCount / 3).toBe(g.network.hiddenLayers.length);
		});

		test("should skip unknown activation type", () => {
			const g = createDefaultGenome("unknown-act");
			g.network.hiddenLayers[0].activation = "UnknownAct" as ActivationType;
			const enc = encodeGenome(g);
			expect(layerActivation(enc, 0)).toBe(ActivationType.Relu);
		});

		test("should skip unknown connection type", () => {
			const g = createDefaultGenome("unknown-ct");
			g.network.hiddenLayers[0].connectionType =
				"UnknownConn" as ConnectionType;
			const enc = encodeGenome(g);
			expect(layerConnectionType(enc, 0)).toBe(ConnectionType.DenseSkip);
		});

		test("should roundtrip through Float32Array", () => {
			const g = createDefaultGenome("roundtrip-f32");
			const enc = encodeGenome(g);
			const restored = decodeGenome(enc, g);
			expect(restored.rl.gamma).toBeCloseTo(g.rl.gamma, 4);
		});
	});

	describe("decodeGenome", () => {
		test("should roundtrip a default genome", () => {
			const original = createDefaultGenome("roundtrip", 3);
			const enc = encodeGenome(original);
			const decoded = decodeGenome(enc, original);

			expect(decoded.id).toBe(original.id);
			expect(decoded.generation).toBe(original.generation);
			expect(decoded.network.inputDim).toBe(original.network.inputDim);
			expect(decoded.network.outputDim).toBe(original.network.outputDim);
			expect(decoded.rl.gamma).toBeCloseTo(original.rl.gamma, 4);
			expect(decoded.rl.learningRate).toBeCloseTo(original.rl.learningRate, 4);
			expect(decoded.rl.horizon.maxEpisodeLength).toBe(
				original.rl.horizon.maxEpisodeLength
			);
			expect(decoded.rl.horizon.nStepReturn).toBe(
				original.rl.horizon.nStepReturn
			);
			expect(decoded.rl.horizon.frameSkip).toBe(original.rl.horizon.frameSkip);
		});

		test("should preserve template identity fields (id, generation, gaControl)", () => {
			const template = createDefaultGenome("template-test", 5);
			const enc = encodeGenome(template);
			const decoded = decodeGenome(enc, template);
			expect(decoded.id).toBe("template-test");
			expect(decoded.generation).toBe(5);
			expect(decoded.gaControl).toEqual(template.gaControl);
			expect(decoded.crossover).toEqual(template.crossover);
			expect(decoded.mutation.rates.noiseStd).toBe(template.mutation.rates.noiseStd);
			expect(decoded.mutation.distribution).toBe(
				template.mutation.distribution
			);
		});

		test("should recover layer structure (count, neurons, activations)", () => {
			const original = createDefaultGenome("layers");
			const enc = encodeGenome(original);
			const decoded = decodeGenome(enc, original);

			expect(decoded.network.hiddenLayers.length).toBe(
				original.network.hiddenLayers.length
			);
			for (let i = 0; i < decoded.network.hiddenLayers.length; i++) {
				const orig = original.network.hiddenLayers[i];
				const dec = decoded.network.hiddenLayers[i];
				expect(dec.neurons).toBe(orig.neurons);
				expect(dec.activation).toBe(orig.activation);
				expect(dec.connectionType).toBe(orig.connectionType);
			}
		});

		test("should clamp extreme encoded values to valid ranges", () => {
			const original = createDefaultGenome("clamp-test");
			const enc = encodeGenome(original);
			enc[ENCODING_OFFSETS.Gamma] = 10;
			enc[ENCODING_OFFSETS.ClipMin] = 100;
			const decoded = decodeGenome(enc, original);
			expect(decoded.rl.gamma).toBeCloseTo(0.9999, 4);
		});

		test("should handle empty hiddenLayers", () => {
			const original = createDefaultGenome("empty-layers");
			original.network.hiddenLayers = [];
			const enc = encodeGenome(original);
			const decoded = decodeGenome(enc, original);
			expect(decoded.network.hiddenLayers.length).toBe(1);
		});

		test("should handle genome with lots of layers (beyond MAX_DEPTH)", () => {
			const original = createDefaultGenome("many-layers");
			const manyLayers: LayerGenome[] = [];
			for (let i = 0; i < 20; i++) {
				manyLayers.push({
					neurons: 64 + i,
					activation: ActivationType.Relu,
					connectionType: ConnectionType.DenseSkip,
					biasType: InitialisationType.Zeros,
				});
			}
			original.network.hiddenLayers = manyLayers;
			const enc = encodeGenome(original);
			const layerCount = (enc.length - SCALAR_DIM) / 3;
			expect(layerCount).toBeLessThanOrEqual(12);

			const decoded = decodeGenome(enc, original);
			expect(decoded.network.hiddenLayers.length).toBeLessThanOrEqual(12);
		});
	});

	describe("roundtrip — extreme RL hyperparameters", () => {
		test("should roundtrip extreme gamma edges", () => {
			const g = createDefaultGenome("gamma-edge");
			g.rl.gamma = 0.8;
			let dec = decodeGenome(encodeGenome(g), g);
			expect(dec.rl.gamma).toBeCloseTo(0.8, 4);

			g.rl.gamma = 0.9999;
			dec = decodeGenome(encodeGenome(g), g);
			expect(dec.rl.gamma).toBeCloseTo(0.9999, 4);
		});

		test("should roundtrip log-scaled learning rate", () => {
			const g = createDefaultGenome("lr-edge");
			g.rl.learningRate = 1e-6;
			let dec = decodeGenome(encodeGenome(g), g);
			expect(dec.rl.learningRate).toBeCloseTo(1e-6, 6);

			g.rl.learningRate = 0.1;
			dec = decodeGenome(encodeGenome(g), g);
			expect(dec.rl.learningRate).toBeCloseTo(0.1, 4);
		});

		test("should roundtrip epsilon values", () => {
			const g = createDefaultGenome("eps-edge");
			g.rl.discretePolicy.epsilonStart = 0.1;
			g.rl.discretePolicy.epsilonMin = 0.001;
			g.rl.discretePolicy.epsilonDecay = 0.9;
			const dec = decodeGenome(encodeGenome(g), g);
			expect(dec.rl.discretePolicy.epsilonStart).toBeCloseTo(0.1, 4);
			expect(dec.rl.discretePolicy.epsilonMin).toBeCloseTo(0.001, 4);
			expect(dec.rl.discretePolicy.epsilonDecay).toBeCloseTo(0.9, 4);
		});

		test("should roundtrip bufferSize", () => {
			const g = createDefaultGenome("buf-edge");
			g.rl.replayBuffer.bufferSize = 1_000_000;
			const dec = decodeGenome(encodeGenome(g), g);
			expect(dec.rl.replayBuffer.bufferSize).toBe(1_000_000);
		});
	});

	describe("encodePopulation / decodePopulation", () => {
		test("should encode and decode back to identical genome array", () => {
			const pop = [
				createDefaultGenome("a"),
				createDefaultGenome("b"),
				createDefaultGenome("c"),
			];
			const mat = encodePopulation(pop);
			const decoded = decodePopulation(mat, pop);
			expect(decoded.length).toBe(pop.length);
			for (let i = 0; i < pop.length; i++) {
				expect(decoded[i].id).toBe(pop[i].id);
				expect(decoded[i].rl.gamma).toBeCloseTo(pop[i].rl.gamma, 4);
			}
		});

		test("should handle single-genome population", () => {
			const pop = [createDefaultGenome("single")];
			const mat = encodePopulation(pop);
			const decoded = decodePopulation(mat, pop);
			expect(decoded[0].id).toBe("single");
		});
	});
});
