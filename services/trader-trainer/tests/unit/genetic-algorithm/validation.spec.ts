import { describe, expect, test } from "@jest/globals";
import { createDefaultGenome } from "../../../src/core/genetic-algorithm/factory";
import {
	ContinuousPolicyType,
	DiscretePolicyType,
	NormalisationType,
} from "../../../src/core/genetic-algorithm/genome";
import {
	repairGenome,
	validateGenome,
} from "../../../src/core/genetic-algorithm/validation";

describe("Validation - validateGenome", () => {
	test("should validate a default genome as valid", () => {
		const genome = createDefaultGenome("valid");
		const result = validateGenome(genome);
		expect(result.valid).toBe(true);
		expect(result.errors.length).toBe(0);
	});

	test("should detect empty id", () => {
		const genome = createDefaultGenome("");
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.path === "id")).toBe(true);
	});

	test("should detect missing id", () => {
		const genome = createDefaultGenome("valid");
		const invalid = { ...genome, id: "" };
		const result = validateGenome(invalid);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid generation", () => {
		const genome = createDefaultGenome("valid", -1);
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid gamma range", () => {
		const genome = createDefaultGenome("valid");
		genome.rl.gamma = 0.5;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.path === "rl.gamma")).toBe(true);
	});

	test("should detect invalid learning rate", () => {
		const genome = createDefaultGenome("valid");
		genome.rl.learningRate = 10;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect clipMin >= clipMax", () => {
		const genome = createDefaultGenome("valid");
		genome.rl.rewardShaping.clipMin = 5;
		genome.rl.rewardShaping.clipMax = 1;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect continuousPolicy clipMin >= clipMax", () => {
		const genome = createDefaultGenome("valid");
		genome.rl.continuousPolicy.clipMin = 5;
		genome.rl.continuousPolicy.clipMax = 0;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
		expect(
			result.errors.some((e) => e.path === "rl.continuousPolicy.clip")
		).toBe(true);
	});

	test("should detect invalid normalization type", () => {
		const genome = createDefaultGenome("valid");
		genome.network.normalization = "invalid" as any;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid epsilonStart", () => {
		const genome = createDefaultGenome("valid");
		genome.rl.discretePolicy.epsilonStart = 2.0;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid crossover probability", () => {
		const genome = createDefaultGenome("valid");
		genome.crossover.probability = 1.5;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});
});

describe("Validation - repairGenome", () => {
	test("should repair an empty hiddenLayers array", () => {
		const genome = createDefaultGenome("repair");
		genome.network.hiddenLayers = [];
		const repaired = repairGenome(genome);
		expect(repaired.network.hiddenLayers.length).toBeGreaterThan(0);
	});

	test("should repair invalid inputDim", () => {
		const genome = createDefaultGenome("repair");
		genome.network.inputDim = -5;
		const repaired = repairGenome(genome);
		expect(repaired.network.inputDim).toBe(1);
	});

	test("should repair invalid outputDim", () => {
		const genome = createDefaultGenome("repair");
		genome.network.outputDim = 0;
		const repaired = repairGenome(genome);
		expect(repaired.network.outputDim).toBe(1);
	});

	test("should repair invalid normalization", () => {
		const genome = createDefaultGenome("repair");
		genome.network.normalization = "invalid" as any;
		const repaired = repairGenome(genome);
		expect(repaired.network.normalization).toBe(NormalisationType.None);
	});

	test("should repair inverted clipMin/clipMax", () => {
		const genome = createDefaultGenome("repair");
		genome.rl.rewardShaping.clipMin = 5;
		genome.rl.rewardShaping.clipMax = 1;
		const repaired = repairGenome(genome);
		expect(repaired.rl.rewardShaping.clipMin).toBeLessThan(
			repaired.rl.rewardShaping.clipMax
		);
	});

	test("should repair invalid continuous policy clipping", () => {
		const genome = createDefaultGenome("repair");
		genome.rl.continuousPolicy.clipMin = 5;
		genome.rl.continuousPolicy.clipMax = 1;
		const repaired = repairGenome(genome);
		expect(repaired.rl.continuousPolicy.clipMin).toBeLessThan(
			repaired.rl.continuousPolicy.clipMax
		);
	});

	test("should repair population size", () => {
		const genome = createDefaultGenome("repair");
		genome.gaControl.populationSize = 1;
		const repaired = repairGenome(genome);
		expect(repaired.gaControl.populationSize).toBe(2);
	});

	test("should repair non-array hiddenLayers", () => {
		const genome = createDefaultGenome("repair");
		(genome.network as any).hiddenLayers = null;
		const repaired = repairGenome(genome);
		expect(repaired.network.hiddenLayers.length).toBe(1);
	});

	test("should repair layer with invalid neurons", () => {
		const genome = createDefaultGenome("repair");
		genome.network.hiddenLayers[0].neurons = 0;
		const repaired = repairGenome(genome);
		expect(repaired.network.hiddenLayers[0].neurons).toBe(1);
	});

	test("should repair invalid id", () => {
		const genome = createDefaultGenome("");
		const repaired = repairGenome(genome);
		expect(repaired.id).toBe("repaired");
	});

	test("should detect non-array hiddenLayers", () => {
		const genome = createDefaultGenome("test");
		(genome.network as any).hiddenLayers = null;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.path === "network.hiddenLayers")).toBe(
			true
		);
	});

	test("should detect empty hiddenLayers array", () => {
		const genome = createDefaultGenome("test");
		genome.network.hiddenLayers = [] as any;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid layer activation", () => {
		const genome = createDefaultGenome("test");
		genome.network.hiddenLayers[0].activation = "invalid" as any;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid layer connectionType", () => {
		const genome = createDefaultGenome("test");
		genome.network.hiddenLayers[0].connectionType = "invalid" as any;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid layer biasType", () => {
		const genome = createDefaultGenome("test");
		genome.network.hiddenLayers[0].biasType = "invalid" as any;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should detect invalid population size", () => {
		const genome = createDefaultGenome("test");
		genome.gaControl.populationSize = 1;
		const result = validateGenome(genome);
		expect(result.valid).toBe(false);
	});

	test("should apply defaults when genome fields are undefined", () => {
		const genome = createDefaultGenome("repair");
		(genome.network as any).inputDim = undefined;
		(genome.network as any).outputDim = undefined;
		genome.network.hiddenLayers = [];
		(genome.rl as any).gamma = undefined;
		(genome.rl as any).learningRate = undefined;
		(genome.rl.rewardShaping as any).clipMin = undefined;
		(genome.rl.rewardShaping as any).clipMax = undefined;
		(genome.rl.rewardShaping as any).scaleFactor = undefined;
		(genome.rl.discretePolicy as any).type = undefined;
		(genome.rl.continuousPolicy as any).type = undefined;
		(genome.rl.continuousPolicy as any).clipMin = undefined;
		(genome.rl.continuousPolicy as any).clipMax = undefined;
		(genome.rl.horizon as any).maxEpisodeLength = undefined;
		(genome.rl.horizon as any).nStepReturn = undefined;
		(genome.rl.horizon as any).frameSkip = undefined;
		(genome.rl.discretePolicy as any).epsilonStart = undefined;
		(genome.rl.discretePolicy as any).epsilonMin = undefined;
		(genome.rl.discretePolicy as any).epsilonDecay = undefined;
		(genome.rl.discretePolicy as any).temperature = undefined;
		(genome.rl.continuousPolicy as any).noiseStd = undefined;
		(genome.rl.continuousPolicy as any).noiseDecay = undefined;
		(genome.rl.replayBuffer as any).bufferSize = undefined;
		(genome.rl.replayBuffer as any).alphaPER = undefined;
		(genome.rl.replayBuffer as any).betaPER = undefined;
		(genome.mutation as any).rate = undefined;
		(genome.mutation as any).sigma = undefined;
		(genome.mutation as any).selfSigma = undefined;
		(genome.crossover as any).probability = undefined;
		(genome.crossover as any).blendAlpha = undefined;
		(genome.crossover as any).sbxEta = undefined;
		(genome.gaControl as any).populationSize = undefined;
		(genome.gaControl as any).elitismFraction = undefined;
		(genome.gaControl as any).survivorFraction = undefined;
		(genome.gaControl as any).episodesPerIndividual = undefined;
		(genome.gaControl as any).maxGenerations = undefined;
		(genome as any).generation = undefined;
		const repaired = repairGenome(genome);
		expect(repaired.network.inputDim).toBe(1);
		expect(repaired.network.outputDim).toBe(1);
		expect(repaired.rl.gamma).toBe(0.99);
		expect(repaired.rl.learningRate).toBe(0.001);
		expect(repaired.rl.rewardShaping.clipMin).toBe(-1);
		expect(repaired.rl.rewardShaping.clipMax).toBe(1);
		expect(repaired.rl.continuousPolicy.clipMin).toBe(-1);
		expect(repaired.rl.continuousPolicy.clipMax).toBe(1);
		expect(repaired.rl.rewardShaping.scaleFactor).toBe(1);
		expect(repaired.rl.discretePolicy.type).toBe(
			DiscretePolicyType.EpsilonGreedy
		);
		expect(repaired.rl.continuousPolicy.type).toBe(
			ContinuousPolicyType.TanhSquashing
		);
		expect(repaired.gaControl.populationSize).toBe(20);
	});

	test("should repair undefined layer neurons", () => {
		const genome = createDefaultGenome("repair");
		(genome.network.hiddenLayers[0] as any).neurons = undefined;
		const repaired = repairGenome(genome);
		expect(repaired.network.hiddenLayers[0].neurons).toBe(32);
	});
});
