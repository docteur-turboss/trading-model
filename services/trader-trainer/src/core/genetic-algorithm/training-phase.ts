import type { Experience } from "../../core/neural-network/type";
import { NormalizationStats } from "../normalization-stats";
import type { BackendFactory, RLBackend } from "./rl-backend";
import type { WindowSet } from "./ga-runner";
import { evaluateGenomeAllWindows, pooledEval } from "./evaluation-pipeline";
import { shapeReward } from "./fitness";
import type {
	Genome,
	GenomeFitnessMeta,
	LamarckGenome,
	MarketStep,
} from "./genome-types";
import type { ObjectiveVector } from "./nsga2";
import { deepFreeze, type DeepReadonly, withGenome } from "./shared-types";
import type { RunningStats } from "./utils";

export interface PrecomputeRewardsContext {
	backend: RLBackend;
	data: MarketStep[];
	genome: DeepReadonly<LamarckGenome>;
	runStats?: RunningStats;
}

function _computePrecomputedReward(
	backend: RLBackend,
	step: MarketStep,
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	runStats?: RunningStats
): number {
	const { reward } = backend.step(step.features, step.price);
	let shaped = shapeReward(reward, rShape);
	if (rShape.normalize) {
		runStats?.update(shaped);
		shaped = runStats?.normalize(shaped) ?? shaped;
	}
	return shaped;
}

export function precomputeRewards(
	ctx: PrecomputeRewardsContext
): Float32Array {
	const { backend, data, genome, runStats } = ctx;
	const buf = new Float32Array(data.length);
	for (let index = 0; index < data.length; index++) {
		buf[index] = _computePrecomputedReward(backend, data[index], genome.rl.rewardShaping, runStats);
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

function _shouldSkipStep(index: number, frameSkip: number): boolean {
	return index % frameSkip !== 0;
}

function _buildQLearningExperience(
	prev: Experience,
	index: number,
	rewardBuf: Float32Array,
	genome: DeepReadonly<LamarckGenome>,
	trainData: MarketStep[],
	maxT: number
): Experience {
	return {
		...prev,
		kind: "qlearning" as const,
		reward: nStepReturn(rewardBuf, index, genome),
		nextState: trainData[index].features,
		done: index === maxT - 1,
	};
}

export function trainPhase(
	ctx: TrainPhaseContext
): void {
	const { backend, trainData, rewardBuf, genome } = ctx;
	const horizon = genome.rl.horizon;
	const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (_shouldSkipStep(index, horizon.frameSkip)) {
			continue;
		}
		backend.step(trainData[index].features, trainData[index].price);

		const pool = backend.getExperiencePool();
		if (pool.length >= 2) {
			backend.train(
				_buildQLearningExperience(pool[pool.length - 2], index, rewardBuf, genome, trainData, maxT),
				genome.rl.gamma
			);
		}
	}
}

function _computeEpisodeReward(
	backend: RLBackend,
	validationData: MarketStep[],
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	horizon: DeepReadonly<LamarckGenome["rl"]["horizon"]>
): number {
	const runStats = new NormalizationStats();
	let epReward = 0;
	const maxT = Math.min(validationData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (index % horizon.frameSkip !== 0) {
			continue;
		}
		const { reward } = backend.step(validationData[index].features, validationData[index].price);
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
	backend.resetEpisode();
	return epReward;
}

function _computeFinalPnl(rawScores: number[]): number {
	return rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length;
}

export function evalPhase(
	genome: DeepReadonly<LamarckGenome>,
	validationData: MarketStep[],
	backendFactory: BackendFactory
): { rawScores: number[]; finalPnl: number } {
	const ctrl = genome.gaControl;
	const rawScores: number[] = [];

	for (let ep = 0; ep < ctrl.episodesPerIndividual; ep++) {
		const backend = backendFactory(genome);
		rawScores.push(_computeEpisodeReward(backend, validationData, genome.rl.rewardShaping, genome.rl.horizon));
	}

	return { rawScores, finalPnl: _computeFinalPnl(rawScores) };
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

function _makeEvalFn(
	windowSets: WindowSet[],
	backendFactory: BackendFactory
): (genome: DeepReadonly<LamarckGenome>) => Promise<import("./evaluation-pipeline").EvaluationResult> {
	return async (genome: DeepReadonly<LamarckGenome>) =>
		evaluateGenomeAllWindows(genome, windowSets, backendFactory);
}

export async function evaluateFitness(
	ctx: EvaluateFitnessContext
): Promise<{
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: ObjectiveVector[];
	metas: GenomeFitnessMeta[];
}> {
	const { population, windowSets, backendFactory, concurrency } = ctx;
	const evalResults = await pooledEval(population, concurrency, _makeEvalFn(windowSets, backendFactory));

	return {
		updatedPop: evalResults.map((result) => result.updatedGenome),
		objectives: evalResults.map((result) => result.objectives),
		metas: evalResults.map((result) => result.meta),
	};
}
