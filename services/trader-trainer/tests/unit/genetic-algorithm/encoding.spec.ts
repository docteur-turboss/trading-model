import { describe, expect, test } from "@jest/globals";
import {
	decodeGenome,
	decodePopulation,
	ENCODED_DIM,
	encodeGenome,
	encodePopulation,
} from "../../../src/core/genetic-algorithm/encoding";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import type {
	Genome,
	LayerGenome,
} from "../../../src/core/genetic-algorithm/genome";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
} from "../../../src/core/genetic-algorithm/genome";

describe("encoding", () => {
	describe("encodeGenome", () => {
		test("should produce a Float32Array of correct length", () => {
			const g = createDefaultGenome("test");
			const vec = encodeGenome(g);
			expect(vec.toFloat32Array()).toBeInstanceOf(Float32Array);
			expect(vec.length).toBe(ENCODED_DIM);
		});

		test("should encode gamma at index 0", () => {
			const g = createDefaultGenome("gamma-test");
			const vec = encodeGenome(g);
			expect(vec.getAt(0)).toBeCloseTo(g.rl.gamma, 4);
		});

		test("should encode learningRate as log-scaled in [0,1]", () => {
			const g = createDefaultGenome("lr-test");
			const vec = encodeGenome(g);
			const expected = Math.log10(Math.max(1e-6, g.rl.learningRate)) / 6 + 1;
			expect(vec.getAt(1)).toBeCloseTo(expected, 6);
		});

		test("should encode depth at index 22 normalised by MAX_DEPTH", () => {
			const g = createDefaultGenome("depth-test");
			const vec = encodeGenome(g);
			expect(vec.getAt(22)).toBeCloseTo(g.network.hiddenLayers.length / 12, 4);
		});

		test("should encode neuron count at layer base normalised by 512", () => {
			const g = createDefaultGenome("neuron-test");
			const vec = encodeGenome(g);
			const base = 23;
			expect(vec.getAt(base)).toBe(g.network.hiddenLayers[0].neurons / 512);
		});

		test("should set one-hot for activation type", () => {
			const g = createDefaultGenome("oh-test");
			const vec = encodeGenome(g);
			const base = 23;
			const activations: ActivationType[] = [
				ActivationType.Relu,
				ActivationType.Sigmoid,
				ActivationType.Tanh,
				ActivationType.LeakyReLu,
				ActivationType.Elu,
				ActivationType.Mish,
				ActivationType.Gelu,
				ActivationType.Softmax,
			];
			const idx = activations.indexOf(g.network.hiddenLayers[0].activation);
			expect(vec.getAt(base + 1 + idx)).toBe(1);
			// other activation slots remain 0
			for (let i = 0; i < activations.length; i++) {
				if (i !== idx) {
					expect(vec.getAt(base + 1 + i)).toBe(0);
				}
			}
		});

		test("should set one-hot for connection type", () => {
			const g = createDefaultGenome("oh-ct-test");
			const vec = encodeGenome(g);
			const base = 23;
			const connTypes: ConnectionType[] = [
				ConnectionType.DenseSkip,
				ConnectionType.FullyConnected,
				ConnectionType.ResidualConnection,
			];
			const idx = connTypes.indexOf(g.network.hiddenLayers[0].connectionType);
			expect(vec.getAt(base + 1 + 8 + idx)).toBe(1);
		});

		test("should zero-pad layer slots beyond genome depth", () => {
			const g = createDefaultGenome("pad-test");
			const vec = encodeGenome(g);
			const depth = g.network.hiddenLayers.length;
			for (let i = depth; i < 12; i++) {
				const base = 23 + i * 12;
				expect(vec.getAt(base)).toBe(0);
			}
		});

		test("should skip unknown activation type in one-hot encoding", () => {
			const g = createDefaultGenome("unknown-act");
			g.network.hiddenLayers[0].activation = "UnknownAct" as ActivationType;
			const vec = encodeGenome(g);
			const base = 23;
			for (let i = 0; i < 8; i++) {
				expect(vec.getAt(base + 1 + i)).toBe(0);
			}
			expect(vec.getAt(base + 1 + 8 + 0)).toBe(1);
		});

		test("should skip unknown connection type in one-hot encoding", () => {
			const g = createDefaultGenome("unknown-ct");
			g.network.hiddenLayers[0].connectionType =
				"UnknownConn" as ConnectionType;
			const vec = encodeGenome(g);
			const base = 23;
			expect(vec.getAt(base + 1 + 0)).toBe(1);
			for (let i = 0; i < 3; i++) {
				expect(vec.getAt(base + 1 + 8 + i)).toBe(0);
			}
		});
	});

	describe("decodeGenome", () => {
		test("should throw on wrong vector length", () => {
			const short = new Float32Array(10);
			const template = createDefaultGenome("err");
			expect(() => decodeGenome(short, template)).toThrow(
				"expected vector of length"
			);
		});

		test("should roundtrip a default genome", () => {
			const original = createDefaultGenome("roundtrip", 3);
			const vec = encodeGenome(original);
			const decoded = decodeGenome(vec.toFloat32Array(), original);

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

		test("should preserve template identity fields (id, fitness, gaControl)", () => {
			const template = createDefaultGenome("template-test", 5);
			// set custom fields that are not encoded
			const modded: Genome = {
				...template,
				fitness: 42,
			};
			const vec = encodeGenome(modded);
			const decoded = decodeGenome(vec.toFloat32Array(), modded);
			expect(decoded.id).toBe("template-test");
			expect(decoded.generation).toBe(5);
			expect(decoded.fitness).toBe(42);
			expect(decoded.gaControl).toEqual(modded.gaControl);
			expect(decoded.crossover).toEqual(modded.crossover);
			expect(decoded.mutation.noiseStd).toBe(modded.mutation.noiseStd);
			expect(decoded.mutation.distribution).toBe(modded.mutation.distribution);
		});

		test("should recover layer structure (count, neurons, activations)", () => {
			const original = createDefaultGenome("layers");
			const vec = encodeGenome(original);
			const decoded = decodeGenome(vec.toFloat32Array(), original);

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
			const vec = encodeGenome(original);
			// push gamma way out of range
			vec.setAt(0, 10);
			vec.setAt(2, 100); // clipMin  — decoded as-is for clamp, but enforced clipMin < clipMax in rewardShaping
			const decoded = decodeGenome(vec.toFloat32Array(), original);
			expect(decoded.rl.gamma).toBeCloseTo(0.9999, 4);
		});

		test("should decode argmax for one-hot activations", () => {
			const original = createDefaultGenome("argmax-act");
			const vec = encodeGenome(original);
			// manually set one-hot to softmax (index 7)
			vec.setAt(23 + 1 + 7, 1);
			vec.setAt(23 + 1 + 0, 0.5); // ReLu gets 0.5 but softmax gets 1 — argmax wins
			const decoded = decodeGenome(vec.toFloat32Array(), original);
			expect(decoded.network.hiddenLayers[0].activation).toBe(
				ActivationType.Softmax
			);
		});

		test("should decode argmax for one-hot connection types", () => {
			const original = createDefaultGenome("argmax-ct");
			const vec = encodeGenome(original);
			// set all one-hots to 0 and manually set 'residual-connection'
			const base = 23;
			for (let i = 0; i < 3; i++) {
				vec.setAt(base + 1 + 8 + i, 0);
			}
			vec.setAt(base + 1 + 8 + 2, 1);
			const decoded = decodeGenome(vec.toFloat32Array(), original);
			expect(decoded.network.hiddenLayers[0].connectionType).toBe(
				ConnectionType.ResidualConnection
			);
		});

		test("should handle empty hiddenLayers", () => {
			const original = createDefaultGenome("empty-layers");
			original.network.hiddenLayers = [];
			const vec = encodeGenome(original);
			const decoded = decodeGenome(vec.toFloat32Array(), original);
			expect(decoded.network.hiddenLayers.length).toBe(1); // minimum depth clamped to 1
		});

		test("should handle genome with lots of layers (beyond MAX_DEPTH)", () => {
			const original = createDefaultGenome("many-layers");
			// create 20 layers
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
			const vec = encodeGenome(original);
			expect(vec.length).toBe(ENCODED_DIM);

			const decoded = decodeGenome(vec.toFloat32Array(), original);
			// depth is clamped to MAX_DEPTH (12)
			expect(decoded.network.hiddenLayers.length).toBeLessThanOrEqual(12);
		});
	});

	describe("roundtrip — extreme RL hyperparameters", () => {
		test("should roundtrip extreme gamma edges", () => {
			const g = createDefaultGenome("gamma-edge");
			g.rl.gamma = 0.8;
			let vec = encodeGenome(g);
			let dec = decodeGenome(vec.toFloat32Array(), g);
			expect(dec.rl.gamma).toBeCloseTo(0.8, 4);

			g.rl.gamma = 0.9999;
			vec = encodeGenome(g);
			dec = decodeGenome(vec.toFloat32Array(), g);
			expect(dec.rl.gamma).toBeCloseTo(0.9999, 4);
		});

		test("should roundtrip log-scaled learning rate", () => {
			const g = createDefaultGenome("lr-edge");
			g.rl.learningRate = 1e-6;
			let vec = encodeGenome(g);
			let dec = decodeGenome(vec.toFloat32Array(), g);
			expect(dec.rl.learningRate).toBeCloseTo(1e-6, 6);

			g.rl.learningRate = 0.1;
			vec = encodeGenome(g);
			dec = decodeGenome(vec.toFloat32Array(), g);
			expect(dec.rl.learningRate).toBeCloseTo(0.1, 4);
		});

		test("should roundtrip epsilon values", () => {
			const g = createDefaultGenome("eps-edge");
			g.rl.discretePolicy.epsilonStart = 0.1;
			g.rl.discretePolicy.epsilonMin = 0.001;
			g.rl.discretePolicy.epsilonDecay = 0.9;
			const vec = encodeGenome(g);
			const dec = decodeGenome(vec.toFloat32Array(), g);
			expect(dec.rl.discretePolicy.epsilonStart).toBeCloseTo(0.1, 4);
			expect(dec.rl.discretePolicy.epsilonMin).toBeCloseTo(0.001, 4);
			expect(dec.rl.discretePolicy.epsilonDecay).toBeCloseTo(0.9, 4);
		});

		test("should roundtrip bufferSize", () => {
			const g = createDefaultGenome("buf-edge");
			g.rl.replayBuffer.bufferSize = 1_000_000;
			const vec = encodeGenome(g);
			const dec = decodeGenome(vec.toFloat32Array(), g);
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
			expect(mat.length).toBe(pop.length * ENCODED_DIM);

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
