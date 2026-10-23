import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Price, type Reward } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import type { MarketStep } from "../../../src/domain/genetic-algorithm/genome-types";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import {
	makeSeededBackendFactory,
	makeTradingAgentBackend,
	type RLBackend,
} from "../../../src/domain/genetic-algorithm/rl-backend";
import { trainPhase } from "../../../src/domain/genetic-algorithm/training-phase";
import {
	ExperienceKind,
	type QLearningExperience,
} from "../../../src/domain/neural-network/type";
import { makeMinimalBestGenome } from "../../fixtures/genome.fixture";

const INPUT_DIM = 32;

function makeFeatures(seed: number): FeatureVector {
	const rng = makePRNG(seed);
	return FeatureVector.fromFloat32Array(
		Float32Array.from({ length: INPUT_DIM }, () => rng() * 2 - 1)
	);
}

function makeMarket(length: number): MarketStep[] {
	return Array.from({ length }, (_, idx) => ({
		features: makeFeatures(100 + idx),
		price: Price.of(100 + 5 * Math.sin(idx / 3)),
	}));
}

/** FNV-1a over the raw bytes of the weight buffer. */
function hashWeights(weights: Float32Array): string {
	const bytes = new Uint8Array(
		weights.buffer,
		weights.byteOffset,
		weights.byteLength
	);
	let hash = 0x811c9dc5;
	for (const byte of bytes) {
		hash = Math.imul(hash ^ byte, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

describe("makeTradingAgentBackend", () => {
	const genome = makeMinimalBestGenome();

	afterEach(() => {
		jest.restoreAllMocks();
	});

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

	describe("Q-learning update", () => {
		const GAMMA = 0.9;
		const ACTION = 1;

		function makeTransition(
			backend: RLBackend,
			done: boolean
		): QLearningExperience {
			const state = makeFeatures(1);
			return {
				kind: ExperienceKind.QLearning,
				input: state.toFloat32Array(),
				output: backend.forwardPass(state).slice(),
				reward: 2 as unknown as Reward,
				nextState: makeFeatures(2).toFloat32Array(),
				done,
				action: ACTION,
			};
		}

		/** |r + γ·max Q(s′) − Q(s, a)|, with the bootstrap dropped when done. */
		function tdError(backend: RLBackend, exp: QLearningExperience): number {
			const qState = backend.forwardPass(
				FeatureVector.fromFloat32Array(exp.input)
			);
			const qNext = backend.forwardPass(
				FeatureVector.fromFloat32Array(exp.nextState)
			);
			const bootstrap = exp.done ? 0 : GAMMA * Math.max(...qNext);
			return Math.abs(exp.reward + bootstrap - qState[exp.action]);
		}

		it.each([
			true,
			false,
		])("should change the weights and shrink the TD error (done=%p)", (done) => {
			const backend = makeTradingAgentBackend(genome, makePRNG(21));
			const exp = makeTransition(backend, done);
			const weightsBefore = backend.getWeights().slice();
			const errorBefore = tdError(backend, exp);

			backend.train(exp, GAMMA);

			expect(backend.getWeights()).not.toEqual(weightsBefore);
			expect(tdError(backend, exp)).toBeLessThan(errorBefore);
		});

		it("should only move Q(s, ·) on the played action", () => {
			const backend = makeTradingAgentBackend(genome, makePRNG(21));
			const exp = makeTransition(backend, true);
			const state = FeatureVector.fromFloat32Array(exp.input);
			const before = backend.forwardPass(state).slice();

			backend.train(exp, GAMMA);

			const after = backend.forwardPass(state);
			const moved = [...after].map((q, idx) => Math.abs(q - before[idx]));
			expect(moved[ACTION]).toBeGreaterThan(
				Math.max(...moved.filter((_, idx) => idx !== ACTION))
			);
		});
	});

	describe("Lamarckian injection", () => {
		it("should round-trip weights exactly through setWeights / getWeights", () => {
			const backend = makeTradingAgentBackend(genome, makePRNG(5));
			const rng = makePRNG(6);
			const weights = Float32Array.from(
				{ length: backend.getWeights().length },
				() => rng() * 2 - 1
			);

			backend.setWeights(weights);

			expect(backend.getWeights()).toEqual(weights);
		});

		it("should start from the genome's trained weights when present", () => {
			const donor = makeTradingAgentBackend(genome, makePRNG(5));
			const trainedWeights = donor.getWeights().slice();

			const heir = makeTradingAgentBackend(
				{ ...genome, trainedWeights },
				makePRNG(99)
			);

			expect(heir.getWeights()).toEqual(trainedWeights);
		});
	});

	describe("replay", () => {
		const MARKET = makeMarket(40);
		const REWARDS = Float32Array.from(MARKET, (_, idx) => Math.cos(idx) / 2);

		// Without a continuous policy type the backend explores a discrete
		// action space, where ε-greedy picks decide which Q-value is trained.
		const DISCRETE_GENOME = {
			...genome,
			rl: {
				...genome.rl,
				continuousPolicy: { ...genome.rl.continuousPolicy, type: undefined },
			},
		} as unknown as typeof genome;

		function trainedWeightsHash(
			seed: number,
			trainedGenome: typeof genome = genome
		): string {
			const backend = makeTradingAgentBackend(trainedGenome, makePRNG(seed));
			trainPhase({
				backend,
				trainData: MARKET,
				rewardBuf: REWARDS,
				genome: trainedGenome,
			});
			return hashWeights(backend.getWeights());
		}

		it.each([
			["continuous", genome],
			["discrete", DISCRETE_GENOME],
		])("%s: should reach the same weights after K training steps with the same seed", (_space, trainedGenome) => {
			expect(trainedWeightsHash(13, trainedGenome)).toBe(
				trainedWeightsHash(13, trainedGenome)
			);
		});

		it.each([
			["continuous", genome],
			["discrete", DISCRETE_GENOME],
		])("%s: should reach different weights with a different seed", (_space, trainedGenome) => {
			expect(trainedWeightsHash(13, trainedGenome)).not.toBe(
				trainedWeightsHash(14, trainedGenome)
			);
		});

		it.each([
			["continuous", genome],
			["discrete", DISCRETE_GENOME],
		])("%s: should not draw from Math.random while training a seeded backend", (_space, trainedGenome) => {
			const spy = jest.spyOn(Math, "random");

			trainedWeightsHash(13, trainedGenome);

			expect(spy).not.toHaveBeenCalled();
		});
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
