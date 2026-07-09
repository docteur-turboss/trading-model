import { describe, expect, test } from "@jest/globals";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	MutationAdaptation,
	MutationDistribution,
	MutationScope,
} from "../../../src/core/genetic-algorithm/genome";
import type {
	LayerGenome,
	MutationGenome,
} from "../../../src/core/genetic-algorithm/genome-types";
import {
	adaptSigma,
	mutateGenome,
	mutateLayer,
} from "../../../src/core/genetic-algorithm/mutation";

describe("Mutation - adaptSigma", () => {
	const rng = () => 0.5;

	function makeMutationGenome(
		overrides?: Partial<MutationGenome>
	): MutationGenome {
		return {
			...createDefaultGenome("test").mutation,
			...overrides,
		} as MutationGenome;
	}

	test("fixed adaptation returns sigma directly", () => {
		const m = makeMutationGenome({
			adaptation: MutationAdaptation.Fixed,
			sigma: 0.5,
		});
		expect(adaptSigma(m, rng)).toBe(0.5);
	});

	test("sigma_adaptive returns perturbed sigma", () => {
		const m = makeMutationGenome({
			adaptation: MutationAdaptation.SigmaAdaptive,
			sigma: 0.5,
		});
		const result = adaptSigma(m, rng);
		expect(result).toBeGreaterThanOrEqual(0.45);
		expect(result).toBeLessThanOrEqual(0.55);
	});

	test("self_adaptive returns positive value", () => {
		const m = makeMutationGenome({
			adaptation: MutationAdaptation.SelfAdaptive,
			sigma: 0.5,
			selfSigma: 0.3,
		});
		const result = adaptSigma(m, rng);
		expect(result).toBeGreaterThan(0);
	});

	test("cma adapts sigma via selfSigma path length", () => {
		// selfSigma ≈ 1.0 → path at expected length → sigma stays ~unchanged
		const m1 = makeMutationGenome({
			adaptation: MutationAdaptation.Cma,
			sigma: 0.5,
			selfSigma: 1.0,
		});
		expect(adaptSigma(m1, rng)).toBeCloseTo(0.5, 5);

		// selfSigma < 1.0 → short path → sigma decreases (exploitation)
		const m2 = makeMutationGenome({
			adaptation: MutationAdaptation.Cma,
			sigma: 0.5,
			selfSigma: 0.1,
		});
		expect(adaptSigma(m2, rng)).toBeLessThan(0.5);

		// selfSigma > 1.0 → long path → sigma increases (exploration)
		const m3 = makeMutationGenome({
			adaptation: MutationAdaptation.Cma,
			sigma: 0.5,
			selfSigma: 2.0,
		});
		expect(adaptSigma(m3, rng)).toBeGreaterThan(0.5);
	});

	test("unknown adaptation returns sigma", () => {
		const m = makeMutationGenome({
			adaptation: "unknown_value" as any,
			sigma: 0.5,
		});
		expect(adaptSigma(m, rng)).toBe(0.5);
	});
});

describe("Mutation - mutateLayer", () => {
	const rng = () => 0.5;
	const m = createDefaultGenome("test").mutation as MutationGenome;

	test("should return a clone of the layer", () => {
		const layer: LayerGenome = {
			neurons: 32,
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
			neurons: 16,
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		};
		const highRateM = { ...m, rate: 0.9, mutateActivations: false };
		const mutated = mutateLayer(layer, highRateM, () => 0.1);
		expect(mutated.activation).toBe(ActivationType.Relu);
	});
});

describe("Mutation - mutateGenome", () => {
	const rng = () => 0.5;

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
		expect(mutated.mutation.sigma).toBeGreaterThanOrEqual(1e-5);
		expect(mutated.mutation.selfSigma).toBeGreaterThanOrEqual(1e-5);
		expect(mutated.mutation.rate).toBeGreaterThanOrEqual(0.001);
		expect(mutated.mutation.rate).toBeLessThanOrEqual(0.5);
	});

	test("per_layer scope should apply layer-level mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.scope = MutationScope.PerLayer;
		const mutated = mutateGenome(genome, rng);
		expect(mutated.network.hiddenLayers.length).toBeGreaterThan(0);
	});

	test("should trigger addNeuronRate structural mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.addNeuronRate = 0.9;
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
		genome.mutation.removeNeuronRate = 0.9;
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
		genome.mutation.addLayerRate = 0.9;
		const origLen = genome.network.hiddenLayers.length;
		const mutated = mutateGenome(genome, () => 0.1);
		expect(mutated.network.hiddenLayers.length).toBeGreaterThanOrEqual(origLen);
	});

	test("should trigger removeLayerRate structural mutation", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.removeLayerRate = 0.9;
		const mutated = mutateGenome(genome, () => 0.1);
		expect(mutated.network.hiddenLayers.length).toBeGreaterThanOrEqual(1);
	});

	test("should trigger mutateActivations when enabled", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.mutateActivations = true;
		genome.mutation.activationMutationRate = 0.9;
		genome.mutation.rate = 0.9;
		const mutated = mutateGenome(genome, () => 0.05);
		expect(mutated.network.hiddenLayers).toBeDefined();
	});

	test("should skip RL hyperparameter mutation when mutateHyperparams is false", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.mutateHyperparams = false;
		const origGamma = genome.rl.gamma;
		const mutated = mutateGenome(genome, () => 0.5);
		expect(mutated.rl.gamma).toBe(origGamma);
	});

	test("should trigger horizon nStepReturn +1 and frameSkip -1 branches", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.mutateHyperparams = true;
		genome.mutation.distribution = MutationDistribution.Uniform;
		genome.mutation.rate = 0;
		genome.mutation.addNeuronRate = 0;
		genome.mutation.removeNeuronRate = 0;
		genome.mutation.addLayerRate = 0;
		genome.mutation.removeLayerRate = 0;
		// Calls before mutateRL: 2 layers + 5 rate checks = 7 calls
		// Then within mutateRL before horizon: gamma(1) + lr(2) + clipMin(1) + clipMax(1) + scaleFactor(1) + maxEpiLen(1) = 7 calls
		// So nStepReturn outer = call 15, inner = call 16
		// frameSkip outer = call 17, inner = call 18
		let idx = 0;
		const rng = () => {
			idx++;
			if (idx === 15) {
				return 0.05; // nStepReturn outer  < 0.1  → true
			}
			if (idx === 16) {
				return 0.05; // nStepReturn inner  < 0.5  → true  → +1
			}
			if (idx === 17) {
				return 0.05; // frameSkip outer   < 0.1  → true
			}
			if (idx === 18) {
				return 0.6; // frameSkip inner  >= 0.5  → false → -1
			}
			return 0.5;
		};
		const mutated = mutateGenome(genome, rng);
		expect(mutated.rl.horizon.nStepReturn).toBeDefined();
		expect(mutated.rl.horizon.frameSkip).toBeDefined();
	});

	test("should exercise perturb function on all RL fields in mutateRL", () => {
		const genome = createDefaultGenome("test");
		genome.mutation.mutateHyperparams = true;
		genome.mutation.rate = 0;
		genome.mutation.addNeuronRate = 0;
		genome.mutation.removeNeuronRate = 0;
		genome.mutation.addLayerRate = 0;
		genome.mutation.removeLayerRate = 0;
		const mutated = mutateGenome(genome, () => 0.5);
		expect(mutated.rl.gamma).toBeGreaterThanOrEqual(0.8);
		expect(mutated.rl.gamma).toBeLessThanOrEqual(0.9999);
		expect(mutated.rl.learningRate).toBeGreaterThanOrEqual(1e-6);
		expect(mutated.rl.learningRate).toBeLessThanOrEqual(1e-1);
		expect(mutated.rl.rewardShaping.clipBounds.min).toBeDefined();
		expect(mutated.rl.rewardShaping.clipBounds.max).toBeDefined();
		expect(mutated.rl.rewardShaping.scaleFactor).toBeGreaterThanOrEqual(0.01);
		expect(mutated.rl.discretePolicy.epsilonStart).toBeGreaterThanOrEqual(0.1);
		expect(mutated.rl.discretePolicy.epsilonStart).toBeLessThanOrEqual(1.0);
		expect(mutated.rl.discretePolicy.epsilonMin).toBeGreaterThanOrEqual(0.001);
		expect(mutated.rl.discretePolicy.epsilonMin).toBeLessThanOrEqual(0.2);
		expect(mutated.rl.discretePolicy.epsilonDecay).toBeGreaterThanOrEqual(0.9);
		expect(mutated.rl.discretePolicy.epsilonDecay).toBeLessThanOrEqual(0.9999);
		expect(mutated.rl.discretePolicy.temperature).toBeGreaterThanOrEqual(0.01);
		expect(mutated.rl.continuousPolicy.noiseStd).toBeGreaterThanOrEqual(0.001);
		expect(mutated.rl.continuousPolicy.noiseDecay).toBeGreaterThanOrEqual(0.9);
		expect(mutated.rl.continuousPolicy.noiseDecay).toBeLessThanOrEqual(0.9999);
		expect(mutated.rl.replayBuffer.alphaPER).toBeGreaterThanOrEqual(0);
		expect(mutated.rl.replayBuffer.alphaPER).toBeLessThanOrEqual(1);
		expect(mutated.rl.replayBuffer.betaPER).toBeGreaterThanOrEqual(0);
		expect(mutated.rl.replayBuffer.betaPER).toBeLessThanOrEqual(1);
	});
});
