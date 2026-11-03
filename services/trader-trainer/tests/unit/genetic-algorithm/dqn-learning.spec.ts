import { describe, expect, it } from "@jest/globals";
import { Price } from "@trading-model/primitives/primitives";
import { FeatureVector } from "../../../src/domain/feature-vector";
import { FEATURE_DIM } from "../../../src/domain/feature-vector-codec";
import { evalPhase } from "../../../src/domain/genetic-algorithm/evaluation-phase";
import { lamarckianUpdate } from "../../../src/domain/genetic-algorithm/evaluation-utils";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import { mutateRL } from "../../../src/domain/genetic-algorithm/genome-rl";
import type {
	LamarckGenome,
	MarketStep,
} from "../../../src/domain/genetic-algorithm/genome-types";
import { makePRNG } from "../../../src/domain/genetic-algorithm/prng";
import {
	type BackendFactory,
	makeTradingAgentBackend,
} from "../../../src/domain/genetic-algorithm/rl-backend";
import type { DeepReadonly } from "../../../src/domain/genetic-algorithm/shared-types";
import { trainPhase } from "../../../src/domain/genetic-algorithm/training-phase";

type Genome = DeepReadonly<LamarckGenome>;

const BASE = createDefaultGenome("g0_0") as Genome;
const DIM = FEATURE_DIM;

/**
 * A falling market (30 % of the moves up) where feature 0 announces the next
 * move: buying on every bar loses, buying only before a rise earns.
 */
function fallingMarket(length: number, seed: number): MarketStep[] {
	const rng = makePRNG(seed);
	let price = 1000;
	return Array.from({ length }, () => {
		const move = rng() < 0.3 ? 1 : -1;
		const features = new Float32Array(DIM);
		features[0] = move;
		const step = {
			features: FeatureVector.fromFloat32Array(features),
			price: Price.of(price),
		};
		price += move;
		return step;
	});
}

const factory: BackendFactory = (genome) =>
	makeTradingAgentBackend(genome, makePRNG(7));

function train(genome: Genome, data: MarketStep[]): Genome {
	const backend = factory(genome);
	trainPhase({ backend, trainData: data, genome });
	return lamarckianUpdate(genome, backend);
}

function meanPnl(genome: Genome, validation: MarketStep[]): number {
	const { episodePnl } = evalPhase({
		genome,
		validationData: validation,
		backendFactory: factory,
	});
	return episodePnl.reduce((sum, pnl) => sum + pnl, 0) / episodePnl.length;
}

function withRL(patch: (rl: Genome["rl"]) => Partial<Genome["rl"]>): Genome {
	return { ...BASE, rl: { ...BASE.rl, ...patch(BASE.rl) } } as Genome;
}

describe("the DQN learns from the market (CT3, ADR-0025)", () => {
	it.each([1, 2, 3])(
		"a trained genome beats the untrained one (market seed %i)",
		(seed) => {
			const validation = fallingMarket(100, seed + 10);

			const untrained = meanPnl(BASE, validation);
			const trained = meanPnl(
				train(BASE, fallingMarket(400, seed)),
				validation
			);

			expect(untrained).toBeLessThan(0);
			expect(trained).toBeGreaterThan(untrained);
		}
	);
});

describe("every RL gene changes what the agent learns", () => {
	const DATA = fallingMarket(120, 4);
	const baseline = train(BASE, DATA).trainedWeights as Float32Array;

	it.each<[string, Genome]>([
		["gamma", withRL(() => ({ gamma: 0.85 as never }))],
		["learningRate", withRL(() => ({ learningRate: 0.01 as never }))],
		[
			"epsilonStart",
			withRL((rl) => ({
				discretePolicy: { ...rl.discretePolicy, epsilonStart: 0.3 as never },
			})),
		],
		[
			"epsilonDecay",
			withRL((rl) => ({
				discretePolicy: { ...rl.discretePolicy, epsilonDecay: 0.95 as never },
			})),
		],
		[
			"nStepReturn",
			withRL((rl) => ({
				horizon: { ...rl.horizon, nStepReturn: 3 as never },
			})),
		],
		[
			"frameSkip",
			withRL((rl) => ({ horizon: { ...rl.horizon, frameSkip: 2 as never } })),
		],
		[
			"batchSize",
			withRL((rl) => ({
				replayBuffer: { ...rl.replayBuffer, batchSize: 2 as never },
			})),
		],
		[
			"prioritized",
			withRL((rl) => ({
				replayBuffer: { ...rl.replayBuffer, prioritized: true },
			})),
		],
		[
			"rewardShaping.scale",
			withRL((rl) => ({
				rewardShaping: {
					...rl.rewardShaping,
					scale: true,
					scaleFactor: 0.1 as never,
				},
			})),
		],
		[
			"rewardShaping.sparse",
			withRL((rl) => ({
				rewardShaping: { ...rl.rewardShaping, sparse: true },
			})),
		],
	])("%s", (_gene, genome) => {
		expect(train(genome, DATA).trainedWeights).not.toEqual(baseline);
	});
});

describe("the GA evolves the switches of the RL genome", () => {
	it.each([
		["rewardShaping.clip", (rl: LamarckGenome["rl"]) => rl.rewardShaping.clip],
		[
			"rewardShaping.normalize",
			(rl: LamarckGenome["rl"]) => rl.rewardShaping.normalize,
		],
		[
			"rewardShaping.sparse",
			(rl: LamarckGenome["rl"]) => rl.rewardShaping.sparse,
		],
		[
			"replayBuffer.prioritized",
			(rl: LamarckGenome["rl"]) => rl.replayBuffer.prioritized,
		],
	])("%s flips under mutation", (_gene, read) => {
		const genome = createDefaultGenome("g0_0");
		const rng = makePRNG(3);
		const seen = new Set<boolean>();
		for (let round = 0; round < 200; round++) {
			seen.add(
				read(
					mutateRL({
						rl: genome.rl,
						mutation: genome.mutation,
						sigma: 0.1,
						rng,
					})
				)
			);
		}

		expect(seen).toEqual(new Set([true, false]));
	});
});
