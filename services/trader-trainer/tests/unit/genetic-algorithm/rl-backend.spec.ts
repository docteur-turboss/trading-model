import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Price } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import { FEATURE_DIM } from "../../../src/domain/feature-vector-codec";
import type { MarketStep } from "../../../src/domain/genetic-algorithm/genome-types";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import {
	makeSeededBackendFactory,
	makeTradingAgentBackend,
	type RLBackend,
	type Transition,
} from "../../../src/domain/genetic-algorithm/rl-backend";
import { trainPhase } from "../../../src/domain/genetic-algorithm/training-phase";
import { makeMinimalBestGenome } from "../../fixtures/genome.fixture";

const INPUT_DIM = FEATURE_DIM;

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

		const STATE = makeFeatures(1);
		const NEXT = makeFeatures(2);

		/** Network input of a flat agent (no position: exposure -1). */
		function flatInput(features: FeatureVector): Float32Array {
			return Float32Array.of(...features.toFloat32Array(), -1);
		}

		function makeTransition(done: boolean): Transition {
			return {
				state: flatInput(STATE),
				action: ACTION,
				reward: 2,
				nextState: flatInput(NEXT),
				done,
			};
		}

		/**
		 * |r + γ·max Q(s′) − Q(s, a)|, with the bootstrap dropped when done
		 * (the backend never trades here, so it stays flat).
		 */
		function tdError(backend: RLBackend, exp: Transition): number {
			const qState = backend.forwardPass(STATE);
			const qNext = backend.forwardPass(NEXT);
			const bootstrap = exp.done ? 0 : GAMMA * Math.max(...qNext);
			return Math.abs(exp.reward + bootstrap - qState[exp.action]);
		}

		/** Stores the transition and replays it alone. */
		function learn(backend: RLBackend, exp: Transition): void {
			backend.remember(exp);
			backend.replay(1, GAMMA);
		}

		it.each([
			true,
			false,
		])("should change the weights and shrink the TD error (done=%p)", (done) => {
			const backend = makeTradingAgentBackend(genome, makePRNG(21));
			const exp = makeTransition(done);
			const weightsBefore = backend.getWeights().slice();
			const errorBefore = tdError(backend, exp);

			learn(backend, exp);

			expect(backend.getWeights()).not.toEqual(weightsBefore);
			expect(tdError(backend, exp)).toBeLessThan(errorBefore);
		});

		it("should only move Q(s, ·) on the played action", () => {
			const backend = makeTradingAgentBackend(genome, makePRNG(21));
			const exp = makeTransition(true);
			const state = STATE;
			const before = backend.forwardPass(state).slice();

			learn(backend, exp);

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

		it("keeps its own initialisation when the trained weights fit another topology", () => {
			const fresh = makeTradingAgentBackend(genome, makePRNG(7));
			// A parent whose network had other layer sizes (mutation, crossover).
			const parentWeights = Array.from(
				{ length: fresh.getWeights().length + 13 },
				() => 0.5
			);

			const child = makeTradingAgentBackend(
				{ ...genome, trainedWeights: parentWeights },
				makePRNG(7)
			);

			expect(child.getWeights()).toEqual(fresh.getWeights());
		});
	});

	describe("training replay", () => {
		const MARKET = makeMarket(40);

		function trainedWeightsHash(seed: number): string {
			const backend = makeTradingAgentBackend(genome, makePRNG(seed));
			trainPhase({ backend, trainData: MARKET, genome });
			return hashWeights(backend.getWeights());
		}

		it("should reach the same weights after K training steps with the same seed", () => {
			expect(trainedWeightsHash(13)).toBe(trainedWeightsHash(13));
		});

		it("should reach different weights with a different seed", () => {
			expect(trainedWeightsHash(13)).not.toBe(trainedWeightsHash(14));
		});

		it("should not draw from Math.random while training a seeded backend", () => {
			const spy = jest.spyOn(Math, "random");

			trainedWeightsHash(13);

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
