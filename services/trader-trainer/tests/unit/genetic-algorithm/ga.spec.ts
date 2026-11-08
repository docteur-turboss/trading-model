import { beforeEach, describe, expect, test } from "@jest/globals";
import { makePRNG } from "@trading-model/crypto/domain/services/prng";
import { crossoverGenomes } from "../../../src/domain/genetic-algorithm/crossover/genome-crossover";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import { MaxBatchSize } from "../../../src/domain/genetic-algorithm/genome-rl/types";
import { mutateGenome } from "../../../src/domain/genetic-algorithm/mutation/mutate";
import { mutateSelfAdaptiveParams } from "../../../src/domain/genetic-algorithm/mutation/self-adaptive-mutation";

const plain = (g: unknown) => JSON.parse(JSON.stringify(g));

const std = (xs: number[]) => {
	const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
	return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

/** Every numeric gene with the domain bounds enforced by the mutation operators. */
function expectInBounds(g: any): void {
	const { rl, mutation, network } = g;
	const within = (v: number, lo: number, hi = Number.POSITIVE_INFINITY) => {
		expect(Number.isFinite(v)).toBe(true);
		expect(v).toBeGreaterThanOrEqual(lo);
		expect(v).toBeLessThanOrEqual(hi);
	};
	within(rl.gamma, 0.8, 0.9999);
	within(rl.learningRate, 1e-6, 1e-1);
	within(rl.discretePolicy.epsilonStart, 0.1, 1);
	within(rl.discretePolicy.epsilonMin, 0.001, 0.2);
	within(rl.discretePolicy.epsilonDecay, 0.9, 0.9999);
	within(rl.replayBuffer.alphaPER, 0, 1);
	within(rl.replayBuffer.betaPER, 0, 1);
	within(rl.replayBuffer.bufferSize, 500);
	within(rl.replayBuffer.batchSize, 1, MaxBatchSize);
	within(rl.horizon.maxEpisodeLength, 10);
	within(rl.horizon.nStepReturn, 1);
	within(rl.horizon.frameSkip, 1);
	within(rl.rewardShaping.scaleFactor, 0.01);
	expect(rl.rewardShaping.clipBounds.lo).toBeLessThan(
		rl.rewardShaping.clipBounds.hi
	);
	within(mutation.rates.sigma, 1e-5);
	within(mutation.rates.rate, 0.001, 0.5);
	for (const layer of network.hiddenLayers) {
		expect(Number.isInteger(layer.neurons)).toBe(true);
		within(layer.neurons, 1);
	}
}

/** Seeded rng whose first draw is 0, so crossoverGenomes always crosses. */
function rngAlwaysCross(seed: number): () => number {
	const r = makePRNG(seed);
	let first = true;
	return () => {
		if (first) {
			first = false;
			return 0;
		}
		return r();
	};
}

describe("Genetic Algorithm - Core Operators", () => {
	let baseGenome: any;

	beforeEach(() => {
		baseGenome = createDefaultGenome("base");
	});

	describe("Mutation", () => {
		test("returns a new genome that differs from the parent and leaves the parent untouched", () => {
			const before = plain(baseGenome);

			const mutated = mutateGenome(baseGenome, makePRNG(1));

			expect(mutated).not.toBe(baseGenome);
			expect(plain(mutated)).not.toEqual(before);
			expect(plain(baseGenome)).toEqual(before);
		});

		test("keeps every numeric gene within the domain bounds over 1000 mutations", () => {
			const rng = makePRNG(2);
			let g = baseGenome;
			for (let i = 0; i < 1000; i++) {
				g = mutateGenome(g, rng);
				expectInBounds(g);
			}
		});

		test("keeps network input/output dimensions and id unchanged", () => {
			const rng = makePRNG(3);
			let g = baseGenome;
			for (let i = 0; i < 200; i++) {
				g = mutateGenome(g, rng);
				expect(g.network.inputDim).toBe(baseGenome.network.inputDim);
				expect(g.network.outputDim).toBe(baseGenome.network.outputDim);
				expect(g.id).toBe(baseGenome.id);
			}
		});

		test("gives identical results for the same seed and different results for different seeds", () => {
			const a1 = plain(mutateGenome(baseGenome, makePRNG(7)));
			const a2 = plain(mutateGenome(baseGenome, makePRNG(7)));
			const b = plain(mutateGenome(baseGenome, makePRNG(8)));

			expect(a2).toEqual(a1);
			expect(b).not.toEqual(a1);
		});

		test("spreads mutated genes with non-zero variance of the expected magnitude over 1000 seeded mutations", () => {
			const rng = makePRNG(11);
			const gammas: number[] = [];
			const logLrRatios: number[] = [];
			for (let i = 0; i < 1000; i++) {
				const m = mutateGenome(baseGenome, rng);
				gammas.push(m.rl.gamma);
				logLrRatios.push(
					Math.log(m.rl.learningRate / baseGenome.rl.learningRate)
				);
			}

			// gamma: Gaussian sigma 0.01 -> std ~0.01
			expect(std(gammas)).toBeGreaterThan(0.005);
			expect(std(gammas)).toBeLessThan(0.02);
			// learningRate: log-normal sigma 0.3 -> std of the log ~0.3
			expect(std(logLrRatios)).toBeGreaterThan(0.2);
			expect(std(logLrRatios)).toBeLessThan(0.4);
		});

		test("chained mutation keeps changing the genome and stays valid", () => {
			const rng = makePRNG(5);
			const m1 = mutateGenome(baseGenome, rng);
			const m2 = mutateGenome(m1, rng);

			expect(plain(m2)).not.toEqual(plain(m1));
			expectInBounds(m2);
		});
	});

	describe("Self-adaptive mutation", () => {
		test("moves sigma by a zero-mean step of std 0.1*sigma", () => {
			const rng = makePRNG(21);
			const cfg = baseGenome.mutation;
			const sigma = cfg.rates.sigma;
			const deltas: number[] = [];
			for (let i = 0; i < 1000; i++) {
				const out = mutateSelfAdaptiveParams(cfg, sigma, rng);
				deltas.push(out.rates.sigma - sigma);
			}
			const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;

			expect(Math.abs(mean)).toBeLessThan(0.002);
			expect(std(deltas)).toBeGreaterThan(sigma * 0.1 * 0.8);
			expect(std(deltas)).toBeLessThan(sigma * 0.1 * 1.2);
		});

		test("clamps rate to [0.001, 0.5] and floors sigma at 1e-5 across 2000 generations", () => {
			const rng = makePRNG(22);
			let cfg = baseGenome.mutation;
			for (let gen = 0; gen < 2000; gen++) {
				cfg = mutateSelfAdaptiveParams(cfg, cfg.rates.sigma, rng);
				expect(cfg.rates.rate).toBeGreaterThanOrEqual(0.001);
				expect(cfg.rates.rate).toBeLessThanOrEqual(0.5);
				expect(cfg.rates.sigma).toBeGreaterThanOrEqual(1e-5);
			}
			expect(cfg.rates).not.toEqual(baseGenome.mutation.rates);
		});

		test("floors sigma at 1e-5 on a strongly negative step and keeps structural rates", () => {
			const cfg = {
				...baseGenome.mutation,
				rates: { sigma: 1e-5, rate: 0.001 },
			};
			// u2 = 0.5 -> cos(pi) = -1: negative Gaussian step
			const out = mutateSelfAdaptiveParams(cfg, 1, () => 0.5);

			expect(out.rates.sigma).toBe(1e-5);
			expect(out.structural).toEqual(cfg.structural);
		});
	});

	describe("Crossover", () => {
		let parent1: any;
		let parent2: any;

		beforeEach(() => {
			parent1 = createDefaultGenome("p1");
			parent2 = mutateGenome(createDefaultGenome("p2"), makePRNG(99));
		});

		test("returns a new object and does not modify the parents", () => {
			const p1 = plain(parent1);
			const p2 = plain(parent2);

			const offspring = crossoverGenomes(parent1, parent2, rngAlwaysCross(1));

			expect(offspring).not.toBe(parent1);
			expect(offspring).not.toBe(parent2);
			expect(plain(parent1)).toEqual(p1);
			expect(plain(parent2)).toEqual(p2);
		});

		test("keeps the network dimensions of the parents", () => {
			const offspring = crossoverGenomes(parent1, parent2, rngAlwaysCross(2));

			expect(offspring.network.inputDim).toBe(parent1.network.inputDim);
			expect(offspring.network.outputDim).toBe(parent1.network.outputDim);
		});

		test("takes every scalar gene from one of the two parents and mixes both over 200 seeds", () => {
			const scalars = (g: any): Record<string, unknown> => ({
				gamma: g.rl.gamma,
				learningRate: g.rl.learningRate,
				epsilonStart: g.rl.discretePolicy.epsilonStart,
				epsilonMin: g.rl.discretePolicy.epsilonMin,
				epsilonDecay: g.rl.discretePolicy.epsilonDecay,
				bufferSize: g.rl.replayBuffer.bufferSize,
				batchSize: g.rl.replayBuffer.batchSize,
				alphaPER: g.rl.replayBuffer.alphaPER,
				betaPER: g.rl.replayBuffer.betaPER,
				maxEpisodeLength: g.rl.horizon.maxEpisodeLength,
				scaleFactor: g.rl.rewardShaping.scaleFactor,
				sigma: g.mutation.rates.sigma,
				rate: g.mutation.rates.rate,
				normalization: g.network.normalization,
			});
			const a = scalars(parent1);
			const b = scalars(parent2);
			let mixed = 0;

			for (let seed = 0; seed < 200; seed++) {
				const c = scalars(
					crossoverGenomes(parent1, parent2, rngAlwaysCross(seed))
				);
				let usedA = false;
				let usedB = false;
				for (const k of Object.keys(a)) {
					expect([a[k], b[k]]).toContain(c[k]);
					if (a[k] !== b[k]) {
						usedA ||= c[k] === a[k];
						usedB ||= c[k] === b[k];
					}
				}
				if (usedA && usedB) {
					mixed++;
				}
			}
			expect(mixed).toBeGreaterThan(100);
		});

		test("takes hidden layers pairwise from the parents and bounds the layer count", () => {
			const extra = { ...parent2.network.hiddenLayers[0], neurons: 77 };
			const deep = {
				...parent2,
				network: {
					...parent2.network,
					hiddenLayers: [...parent2.network.hiddenLayers, extra],
				},
			};
			const minLen = parent1.network.hiddenLayers.length;
			const maxLen = deep.network.hiddenLayers.length;

			for (let seed = 0; seed < 100; seed++) {
				const layers = crossoverGenomes(parent1, deep, rngAlwaysCross(seed))
					.network.hiddenLayers;
				expect(layers.length).toBeGreaterThanOrEqual(minLen);
				expect(layers.length).toBeLessThanOrEqual(maxLen);
				for (let i = 0; i < minLen; i++) {
					expect([
						parent1.network.hiddenLayers[i].neurons,
						deep.network.hiddenLayers[i].neurons,
					]).toContain(layers[i].neurons);
				}
			}
		});

		test("returns a copy of parent A when the crossover probability is not hit", () => {
			const offspring = crossoverGenomes(parent1, parent2, () => 0.999);

			expect(offspring).not.toBe(parent1);
			expect(plain(offspring)).toEqual(plain(parent1));
		});

		test("reproduces identical parents exactly", () => {
			const offspring = crossoverGenomes(parent1, parent1, rngAlwaysCross(3));

			expect(plain(offspring)).toEqual(plain(parent1));
		});

		test("is deterministic for a given seed", () => {
			expect(
				plain(crossoverGenomes(parent1, parent2, rngAlwaysCross(4)))
			).toEqual(plain(crossoverGenomes(parent1, parent2, rngAlwaysCross(4))));
		});
	});

	describe("Genome Factory", () => {
		test("creates a default genome with the expected identity and in-bounds genes", () => {
			const genome = createDefaultGenome("default");

			expect(genome.id).toBe("default");
			expect(genome.generation).toBe(0);
			expect(genome.network.hiddenLayers.length).toBeGreaterThan(0);
			expectInBounds(genome);
		});

		test("is deterministic: same id yields the same genome", () => {
			expect(plain(createDefaultGenome("clone"))).toEqual(
				plain(createDefaultGenome("clone"))
			);
		});
	});

	describe("Mutation-Crossover Integration", () => {
		test("keeps genomes within bounds and dimensions over 5 generations of crossover + mutation", () => {
			const rng = makePRNG(31);
			let population = [createDefaultGenome("g1"), createDefaultGenome("g2")];

			for (let gen = 0; gen < 5; gen++) {
				const prev = population;
				population = prev.map((p, i) =>
					mutateGenome(
						crossoverGenomes(p, prev[(i + 1) % prev.length], rng),
						rng
					)
				);
			}

			for (const g of population) {
				expectInBounds(g);
				expect(g.network.inputDim).toBe(baseGenome.network.inputDim);
				expect(g.network.outputDim).toBe(baseGenome.network.outputDim);
			}
			expect(plain(population[0])).not.toEqual(plain(baseGenome));
		});
	});

	describe("Edge Cases", () => {
		test("mutates a network without hidden layers without inventing layers and keeps dims", () => {
			const simpleGenome = {
				...baseGenome,
				network: {
					...baseGenome.network,
					inputDim: 4,
					outputDim: 3,
					hiddenLayers: [],
				},
			};

			const mutated = mutateGenome(simpleGenome, () => 0.99);

			expect(mutated.network.hiddenLayers).toEqual([]);
			expect(mutated.network.inputDim).toBe(4);
			expect(mutated.network.outputDim).toBe(3);
		});

		test("keeps dims and positive neuron counts in a very large network", () => {
			const layer = baseGenome.network.hiddenLayers[0];
			const largeGenome = {
				...baseGenome,
				network: {
					...baseGenome.network,
					inputDim: 100,
					outputDim: 10,
					hiddenLayers: new Array(10).fill({ ...layer, neurons: 256 }),
				},
			};

			const mutated = mutateGenome(largeGenome, makePRNG(41));

			expect(mutated.network.inputDim).toBe(100);
			expect(mutated.network.outputDim).toBe(10);
			expect(mutated.network.hiddenLayers.length).toBeGreaterThanOrEqual(9);
			expectInBounds(mutated);
		});

		test("pulls extreme hyperparameters back inside the bounds", () => {
			const extremeGenome = {
				...baseGenome,
				rl: { ...baseGenome.rl, gamma: 0.999999, learningRate: 5 },
			};

			const mutated = mutateGenome(extremeGenome, makePRNG(42));

			expect(mutated.rl.gamma).toBeLessThanOrEqual(0.9999);
			expect(mutated.rl.learningRate).toBeLessThanOrEqual(0.1);
		});
	});
});
