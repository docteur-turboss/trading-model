import type { Experience } from "../../core/neural-network/type";
import { NormalizationStats } from "../normalization-stats";
import type { BackendFactory, RLBackend, WindowSet } from "./ga-runner";
import { evaluateGenomeAllWindows, pooledEval } from "./evaluation-pipeline";
import { shapeReward } from "./fitness";
import type {
	Genome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import type { DeepReadonly } from "./shared-types";
import type { RunningStats } from "./utils";

function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}

	if (ArrayBuffer.isView(obj)) {
		return obj as DeepReadonly<TValue>;
	}

	for (const key of Object.keys(obj)) {
		const val = (obj as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
			deepFreeze(val);
		}
	}

	return Object.freeze(obj) as DeepReadonly<TValue>;
}

function withGenome<TGenome extends Genome>(
	base: DeepReadonly<TGenome>,
	patch: Partial<TGenome>
): DeepReadonly<TGenome> {
	return deepFreeze({ ...base, ...patch } as TGenome) as DeepReadonly<TGenome>;
}

export interface PrecomputeRewardsContext {
	backend: RLBackend;
	data: MarketStep[];
	genome: DeepReadonly<LamarckGenome>;
	runStats?: RunningStats;
}

export function precomputeRewards(
	ctx: PrecomputeRewardsContext
): Float32Array {
	const { backend, data, genome, runStats } = ctx;
	const rShape = genome.rl.rewardShaping;
	const buf = new Float32Array(data.length);
	for (let index = 0; index < data.length; index++) {
		const { reward } = backend.step(data[index].features, data[index].price);
		let shaped = shapeReward(reward, rShape);
		if (rShape.normalize) {
			runStats?.update(shaped);
			shaped = runStats?.normalize(shaped) ?? shaped;
		}
		buf[index] = shaped;
	}
	return buf;
}

function nStepReturn(
	buf: Float32Array,
	index: number,
	genome: DeepReadonly<LamarckGenome>
): number {
	let ret = 0;
	const count = genome.rl.horizon.nStepReturn;
	for (let i = 0; i < count && index + i < buf.length; i++) {
		ret += genome.rl.gamma ** i * buf[index + i];
	}
	return ret;
}

export interface TrainPhaseContext {
	backend: RLBackend;
	trainData: MarketStep[];
	rewardBuf: Float32Array;
	genome: DeepReadonly<LamarckGenome>;
}

export function trainPhase(
	ctx: TrainPhaseContext
): void {
	const { backend, trainData, rewardBuf, genome } = ctx;
	const horizon = genome.rl.horizon;
	const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (index % horizon.frameSkip !== 0) {
			continue;
		}

		backend.step(trainData[index].features, trainData[index].price);

		const pool = backend.getExperiencePool();
		if (pool.length >= 2) {
			const prev = pool[pool.length - 2];
			backend.train(
				{
					...prev,
					kind: "qlearning" as const,
					reward: nStepReturn(rewardBuf, index, genome),
					nextState: trainData[index].features,
					done: index === maxT - 1,
				},
				genome.rl.gamma
			);
		}
	}
}

export function evalPhase(
	genome: DeepReadonly<LamarckGenome>,
	validationData: MarketStep[],
	backendFactory: BackendFactory
): { rawScores: number[]; finalPnl: number } {
	const ctrl = genome.gaControl;
	const rShape = genome.rl.rewardShaping;
	const horizon = genome.rl.horizon;
	const rawScores: number[] = [];

	for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
		const backend = backendFactory(genome);
		const runStats = new NormalizationStats();
		let epReward = 0;

		const maxT = Math.min(validationData.length, horizon.maxEpisodeLength);

		for (let index = 0; index < maxT; index++) {
			if (index % horizon.frameSkip !== 0) {
				continue;
			}

			const { reward } = backend.step(
				validationData[index].features,
				validationData[index].price
			);

			let shaped = shapeReward(reward, rShape);
			if (rShape.normalize) {
				runStats.update(shaped);
				shaped = runStats.normalize(shaped);
			}
			if (!rShape.sparse) {
				epReward += shaped;
			}
		}

		if (rShape.sparse) {
			epReward = backend.getPnL();
		}
		rawScores.push(epReward);
		backend.resetEpisode();
	}

	return {
		rawScores,
		finalPnl:
			rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length,
	};
}

export function lamarckianUpdate(
	genome: DeepReadonly<LamarckGenome>,
	backend: RLBackend
): DeepReadonly<LamarckGenome> {
	const snapshot = backend.getWeights().slice();
	return withGenome(genome, {
		trainedWeights: snapshot,
	} as Partial<LamarckGenome>);
}

export interface EvaluateFitnessContext {
	population: DeepReadonly<LamarckGenome>[];
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	concurrency: number;
}

export async function evaluateFitness(
	ctx: EvaluateFitnessContext
): Promise<{
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: ObjectiveVector[];
	metas: GenomeFitnessMeta[];
}> {
	const { population, windowSets, backendFactory, concurrency } = ctx;
	const evalResults = await pooledEval(
		population,
		concurrency,
		async (genome: DeepReadonly<LamarckGenome>) =>
			evaluateGenomeAllWindows(genome, windowSets, backendFactory)
	);

	return {
		updatedPop: evalResults.map((result) => result.updatedGenome),
		objectives: evalResults.map((result) => result.objectives),
		metas: evalResults.map((result) => result.meta),
	};
}
