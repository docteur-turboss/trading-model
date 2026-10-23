import { describe, expect, it } from "@jest/globals";
import { FeatureVector } from "../../../src/domain/feature-vector";
import {
	makeSeededBackendFactory,
	makeTradingAgentBackend,
} from "../../../src/domain/genetic-algorithm/rl-backend";
import { makeMinimalBestGenome } from "../../fixtures/genome.fixture";

describe("makeTradingAgentBackend", () => {
	const genome = makeMinimalBestGenome();

	it("should build a real agent from the default genome", () => {
		const backend = makeTradingAgentBackend(genome);
		const output = backend.forwardPass(new FeatureVector());

		expect(output).toHaveLength(genome.network.outputDim);
		expect([...output].every(Number.isFinite)).toBe(true);
	});

	it("should keep the Q-value output layer linear (unbounded)", () => {
		const backend = makeTradingAgentBackend(genome);
		backend.setWeights(new Float32Array(backend.getWeights().length).fill(-1));

		// Hidden ReLU outputs are >= 0, so every Q-value is <= -1 (bias);
		// a ReLU or sigmoid output head could never go below 0.
		const output = backend.forwardPass(new FeatureVector());

		expect([...output].every((q) => q <= -1)).toBe(true);
	});
});

describe("makeSeededBackendFactory", () => {
	const genome = makeMinimalBestGenome();

	const weightsOf = (seed: number, count: number) => {
		const factory = makeSeededBackendFactory(seed);
		return Array.from({ length: count }, () => factory(genome).getWeights());
	};

	it("should replay the same initial weights for the same seed", () => {
		expect(weightsOf(7, 3)).toEqual(weightsOf(7, 3));
	});

	it("should give each backend of a factory its own stream", () => {
		const [first, second] = weightsOf(7, 2);

		expect(first).not.toEqual(second);
	});

	it("should initialise different weights for different seeds", () => {
		expect(weightsOf(7, 1)).not.toEqual(weightsOf(8, 1));
	});
});
