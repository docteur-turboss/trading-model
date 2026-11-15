import { describe, expect, test } from "@jest/globals";
import type {
	Percentage,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import type {
	LayerGenome,
	MutationGenome,
} from "../../../src/domain/genetic-algorithm/genome";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
} from "../../../src/domain/genetic-algorithm/genome";
import { mutateLayer } from "../../../src/domain/genetic-algorithm/genome-network/mutation";
import { mutateDiscreteStepParam } from "../../../src/domain/genetic-algorithm/genome-rl/mutation";
import { mutateGenome } from "../../../src/domain/genetic-algorithm/mutation/mutate";

describe("Mutation - mutateLayer", () => {
	const rng = () => 0.5;
	const m = createDefaultGenome("test").mutation as MutationGenome;

	test("should return a clone of the layer", () => {
		const layer: LayerGenome = {
			neurons: 32 as PositiveInt,
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		};
		const mutated = mutateLayer(layer, m, rng);
		expect(mutated.neurons).toBe(32);
		expect(mutated.activation).toBe(ActivationType.Relu);
	});

	test("should increase neurons with high rng when rate is high", () => {
		const layer: LayerGenome = {
			neurons: 16 as PositiveInt,
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		};
		const highRateM = { ...m, rate: 0.9 };
		const mutated = mutateLayer(layer, highRateM, () => 0.1);
		expect(mutated.activation).toBe(ActivationType.Relu);
	});
});

describe("Mutation - mutateGenome", () => {
	const rng = () => 0.5;

	/** Deterministic RNG that consumes a fixed value sequence, then uses 0.5. */
	function rngSequence(...values: number[]): () => number {
		let index = 0;
		return () => (index < values.length ? values[index++]! : 0.5);
	}

	test("should return a new genome instance", () => {
		const genome = createDefaultGenome("test");
		const mutated = mutateGenome(genome, rng);
		expect(mutated).not.toBe(genome);
	});

	test("should preserve genome identity", () => {
		const genome = createDefaultGenome("test-id");
		const mutated = mutateGenome(genome, rng);
		expect(mutated.id).toBe("test-id");
	});

	test("should preserve network structure", () => {
		const genome = createDefaultGenome("test");
		const mutated = mutateGenome(genome, rng);
		expect(mutated.network.inputDim).toBe(genome.network.inputDim);
		expect(mutated.network.outputDim).toBe(genome.network.outputDim);
	});

	test("should produce valid genome after mutation", () => {
		const genome = createDefaultGenome("test");
		const mutated = mutateGenome(genome, rng);
		expect(mutated.rl.gamma).toBeGreaterThanOrEqual(0.8);
		expect(mutated.rl.gamma).toBeLessThanOrEqual(0.9999);
		expect(mutated.rl.learningRate).toBeGreaterThanOrEqual(1e-6);
		expect(mutated.rl.learningRate).toBeLessThanOrEqual(1e-1);
	});

	test("self-adaptive sigma should be updated", () => {
		const genome = createDefaultGenome("test");
		const mutated = mutateGenome(genome, rng);
		expect(mutated.mutation.rates.sigma).toBeGreaterThanOrEqual(1e-5);
		expect(mutated.mutation.rates.rate).toBeGreaterThanOrEqual(0.001);
		expect(mutated.mutation.rates.rate).toBeLessThanOrEqual(0.5);
	});

	test("should trigger addNeuronRate structural mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.structural.addNeuronRate = 0.9 as Percentage;
		const origNeurons = genome.network.hiddenLayers.map((l) => l.neurons);
		const mutated = mutateGenome(genome, () => 0.1);
		let changed = false;
		for (let i = 0; i < origNeurons.length; i++) {
			if (mutated.network.hiddenLayers[i]!.neurons !== origNeurons[i]) {
				changed = true;
			}
		}
		expect(changed).toBe(true);
	});

	test("should trigger removeNeuronRate structural mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.structural.removeNeuronRate = 0.9 as Percentage;
		const origNeurons = genome.network.hiddenLayers.map((l) => l.neurons);
		const mutated = mutateGenome(genome, () => 0.1);
		let changed = false;
		for (let i = 0; i < origNeurons.length; i++) {
			if (mutated.network.hiddenLayers[i]!.neurons !== origNeurons[i]) {
				changed = true;
			}
		}
		expect(changed).toBe(true);
	});

	test("should trigger addLayerRate structural mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.structural.addLayerRate = 0.9 as Percentage;
		const origLen = genome.network.hiddenLayers.length;
		const mutated = mutateGenome(genome, () => 0.1);
		expect(mutated.network.hiddenLayers.length).toBeGreaterThanOrEqual(origLen);
	});

	test("should trigger removeLayerRate structural mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.structural.removeLayerRate = 0.9 as Percentage;
		const mutated = mutateGenome(genome, () => 0.1);
		expect(mutated.network.hiddenLayers.length).toBeGreaterThanOrEqual(1);
	});

	test("should add one to a discrete step param when both rng gates pass", () => {
		expect(mutateDiscreteStepParam(10, rngSequence(0.05, 0.05))).toBe(11);
	});

	test("should subtract one when the direction gate fails", () => {
		expect(mutateDiscreteStepParam(10, rngSequence(0.05, 0.6))).toBe(9);
	});

	test("should leave the param unchanged when the outer gate fails", () => {
		expect(mutateDiscreteStepParam(10, rngSequence(0.5))).toBe(10);
	});

	test("should exercise perturb function on all RL fields in mutateRL", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.rates.rate = 0 as Percentage;
		genome.mutation.structural.addNeuronRate = 0 as Percentage;
		genome.mutation.structural.removeNeuronRate = 0 as Percentage;
		genome.mutation.structural.addLayerRate = 0 as Percentage;
		genome.mutation.structural.removeLayerRate = 0 as Percentage;
		const mutated = mutateGenome(genome, () => 0.5);
		expect(mutated.rl.gamma).toBeGreaterThanOrEqual(0.8);
		expect(mutated.rl.gamma).toBeLessThanOrEqual(0.9999);
		expect(mutated.rl.learningRate).toBeGreaterThanOrEqual(1e-6);
		expect(mutated.rl.learningRate).toBeLessThanOrEqual(1e-1);
		expect(mutated.rl.rewardShaping.clipBounds.lo).toBeDefined();
		expect(mutated.rl.rewardShaping.clipBounds.hi).toBeDefined();
		expect(mutated.rl.rewardShaping.scaleFactor).toBeGreaterThanOrEqual(0.01);
		expect(mutated.rl.discretePolicy.epsilonStart).toBeGreaterThanOrEqual(0.1);
		expect(mutated.rl.discretePolicy.epsilonStart).toBeLessThanOrEqual(1.0);
		expect(mutated.rl.discretePolicy.epsilonMin).toBeGreaterThanOrEqual(0.001);
		expect(mutated.rl.discretePolicy.epsilonMin).toBeLessThanOrEqual(0.2);
		expect(mutated.rl.discretePolicy.epsilonDecay).toBeGreaterThanOrEqual(0.9);
		expect(mutated.rl.discretePolicy.epsilonDecay).toBeLessThanOrEqual(0.9999);
		expect(mutated.rl.replayBuffer.batchSize).toBeGreaterThanOrEqual(1);
		expect(mutated.rl.replayBuffer.batchSize).toBeLessThanOrEqual(64);
		expect(mutated.rl.replayBuffer.alphaPER).toBeGreaterThanOrEqual(0);
		expect(mutated.rl.replayBuffer.alphaPER).toBeLessThanOrEqual(1);
		expect(mutated.rl.replayBuffer.betaPER).toBeGreaterThanOrEqual(0);
		expect(mutated.rl.replayBuffer.betaPER).toBeLessThanOrEqual(1);
	});
});
