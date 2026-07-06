/**
 * EvaluationPipeline: Orchestrates RL training and evaluation phases.
 * Handles reward shaping, n-step returns, shadow backends, and Lamarckian updates.
 */

import type { Experience } from "../../core/neural-network/type";
import { NormalizationStats } from "../normalization-stats";
import {
	computeAdjustedFitness,
	estimateComplexity,
} from "./complexity-estimator";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { DeepReadonly } from "./shared-types";
import { computeSharpe, computeVariance, type RunningStats } from "./utils";

import type { BackendFactory, RLBackend } from "./rl-backend";

interface GenomeFitnessMeta {
	episodesRun: number;
	computeMs: number;
	efficiencyScore: number;
	variance: number;
	rawScores: number[];
}

// RunningStats imported from ./utils

/**
 * Apply reward shaping (normalize, sparse mode, etc).
 */
function shapeReward(
	raw: number,
	config: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>
): number {
	let shaped = raw;
	if (config.clip) {
		shaped = Math.max(config.clipMin, Math.min(config.clipMax, shaped));
	}
	return shaped;
}

/**
 * Precompute rewards for all market steps using a shadow backend.
 * WARNING: mutates the shadow backend (wallet, pool). Always pass a fresh one.
 */
interface PrecomputeRewardsContext {
	backend: RLBackend;
	data: MarketStep[];
	genome: DeepReadonly<LamarckGenome>;
	runStats?: RunningStats;
}

function precomputeRewards(
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
			/* istanbul ignore next */
			shaped = runStats?.normalize(shaped) ?? shaped;
		}
		buf[index] = shaped;
	}
	return buf;
}

/**
 * Compute n-step discounted return from reward buffer.
 */
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

/**
 * Train phase: backend learns from pre-computed reward buffer.
 * rewardBuf MUST have been computed by a shadow backend beforehand.
 * Skips training when the experience pool has fewer than 2 entries to
 * prevent out-of-bounds access on pool[pool.length - 2].
 */
interface TrainPhaseContext {
	backend: RLBackend;
	trainData: MarketStep[];
	rewardBuf: Float32Array;
	genome: DeepReadonly<LamarckGenome>;
}

function trainPhase(
	ctx: TrainPhaseContext
): void {
	const { backend, trainData, rewardBuf, genome } = ctx;
	const horizon = genome.rl.horizon;
	const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (index % horizon.frameSkip !== 0) {
			continue;
		}

		// step() already does inference + action + wallet update internally
		backend.step(trainData[index].features, trainData[index].price);

		const pool = backend.getExperiencePool();
		if (pool.length < 2) {
			continue;
		}

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

/**
 * Eval phase: evaluate genome on held-out validation data.
 * Does NOT update weights; only accumulates PnL.
 */
function _runEvalEpisode(
	genome: DeepReadonly<LamarckGenome>,
	validationData: MarketStep[],
	backendFactory: BackendFactory
): number {
	const backend = backendFactory(genome);
	const rShape = genome.rl.rewardShaping;
	const horizon = genome.rl.horizon;
	const runStats = new NormalizationStats();
	let epReward = 0;

	const maxT = Math.min(validationData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (index % horizon.frameSkip !== 0) {
			continue;
		}

		const stepReward = _stepAndShapeReward(backend, validationData[index], rShape, runStats);
		epReward += stepReward;
	}

	if (rShape.sparse) {
		epReward = backend.getPnL();
	}
	backend.resetEpisode();

	return epReward;
}

function _stepAndShapeReward(
	backend: RLBackend,
	step: MarketStep,
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	runStats: NormalizationStats
): number {
	const { reward } = backend.step(step.features, step.price);
	const shaped = shapeReward(reward, rShape);

	if (rShape.normalize) {
		runStats.update(shaped);
		return runStats.normalize(shaped);
	}

	return rShape.sparse ? 0 : shaped;
}

function evalPhase(
	genome: DeepReadonly<LamarckGenome>,
	validationData: MarketStep[],
	backendFactory: BackendFactory
): { rawScores: number[]; finalPnL: number } {
	const numEpisodes = genome.gaControl.episodesPerIndividual;
	const rawScores: number[] = [];

	for (let ep = 0; ep < numEpisodes; ep++) {
		rawScores.push(_runEvalEpisode(genome, validationData, backendFactory));
	}

	return {
		rawScores,
		finalPnL:
			rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length,
	};
}

/**
 * Extract trained weights from backend and attach to genome.
 * Returns a new deep-frozen genome; original untouched.
 */
function lamarckianUpdate(
	genome: DeepReadonly<LamarckGenome>,
	backend: RLBackend
): DeepReadonly<LamarckGenome> {
	const snapshot = backend.getWeights().slice();
	return {
		...genome,
		trainedWeights: snapshot,
	} as DeepReadonly<LamarckGenome>;
}

function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	// istanbul ignore if: defensive — always called with a real object
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}

	// istanbul ignore if: defensive — always called with a plain object
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

function computeFitness(_fitnessType: string, scores: number[]): number {
	// Placeholder: implement based on your fitnessType logic
	return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export interface EvaluationResult {
	updatedGenome: DeepReadonly<LamarckGenome>;
	rawScores: number[];
	finalPnL: number;
}

function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`[Invariant] ${message}`);
	}
}

/**
 * Evaluate a single genome on a single window set.
 * Pure function (no side effects): returns new genome + scores.
 */
function _validateGenomeInputs(
	genome: DeepReadonly<LamarckGenome>,
	windowSet: { id: string; train: MarketStep[]; validation: MarketStep[] }
): void {
	invariant(genome.network.inputDim > 0, "inputDim must be positive");
	invariant(genome.network.outputDim > 0, "outputDim must be positive");
	invariant(
		typeof genome.rl.rewardShaping?.clipMin === "number",
		"rewardShaping.clipMin must be a number"
	);
	invariant(
		typeof genome.rl.rewardShaping?.clipMax === "number",
		"rewardShaping.clipMax must be a number"
	);
	invariant(windowSet.train.length > 0, "windowSet.train must not be empty");
	invariant(
		windowSet.validation.length > 0,
		"windowSet.validation must not be empty"
	);
}

function _validateEvalResult(result: { rawScores: number[]; finalPnL: number }): void {
	invariant(
		Number.isFinite(result.finalPnL),
		`finalPnL must be finite, got ${result.finalPnL}`
	);
	for (const score of result.rawScores) {
		invariant(Number.isFinite(score), `rawScore must be finite, got ${score}`);
	}
}

export function evaluateSingleGenomeOnWindow(
	genome: DeepReadonly<LamarckGenome>,
	windowSet: { id: string; train: MarketStep[]; validation: MarketStep[] },
	backendFactory: BackendFactory
): EvaluationResult {
	_validateGenomeInputs(genome, windowSet);

	const shadowBackend = backendFactory(genome);
	const shadowStats = new NormalizationStats();
	const rewardBuf = precomputeRewards({
		backend: shadowBackend,
		data: windowSet.train,
		genome,
		runStats: shadowStats,
	});

	const trainBackend = backendFactory(genome);
	trainPhase({ backend: trainBackend, trainData: windowSet.train, rewardBuf, genome });

	const updatedGenome = deepFreeze(lamarckianUpdate(genome, trainBackend));

	const evalResult = evalPhase(
		updatedGenome,
		windowSet.validation,
		backendFactory
	);

	_validateEvalResult(evalResult);

	return {
		updatedGenome,
		rawScores: evalResult.rawScores,
		finalPnL: evalResult.finalPnL,
	};
}

/**
 * Evaluate a single genome across all window sets:
 * - Train phase on each window's training data
 * - Eval phase on each window's validation data
 * - Lamarckian weight persistence across windows
 * - Returns updated genome + fitness meta + objectives
 */
interface ComputeAllResultsContext {
	genome: DeepReadonly<LamarckGenome>;
	currentGenome: DeepReadonly<LamarckGenome>;
	allRaw: number[];
	allPnL: number[];
	t0: number;
}

function _computeAllResults(
	ctx: ComputeAllResultsContext
): {
	updatedGenome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
	objectives: { avgPnl: number; sharpe: number; negFlops: number };
} {
	const { genome, currentGenome, allRaw, allPnL, t0 } = ctx;
	const complexity = estimateComplexity(currentGenome);
	const Lambda = 0.15;
	const fitness = computeFitness(genome.gaControl.fitnessType, allRaw);
	const adjFitness = computeAdjustedFitness(fitness, complexity, Lambda);

	const avgPnL = allPnL.reduce((sum, value) => sum + value, 0) / allPnL.length;
	const sharpe = computeSharpe(allRaw);
	const negFlops = -complexity.inferenceFLOPs;

	return {
		updatedGenome: currentGenome,
		meta: {
			episodesRun: allRaw.length,
			computeMs: Date.now() - t0,
			efficiencyScore: adjFitness,
			variance: computeVariance(allRaw),
			rawScores: allRaw,
		},
		objectives: { avgPnl: avgPnL, sharpe, negFlops },
	};
}

export async function evaluateGenomeAllWindows(
	genome: DeepReadonly<LamarckGenome>,
	windowSets: Array<{
		id: string;
		train: MarketStep[];
		validation: MarketStep[];
	}>,
	backendFactory: BackendFactory
): Promise<{
	updatedGenome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
	objectives: { avgPnl: number; sharpe: number; negFlops: number };
}> {
	const t0 = Date.now();
	const allRaw: number[] = [];
	const allPnL: number[] = [];

	let currentGenome = genome;

	for (const ws of windowSets) {
		const result = evaluateSingleGenomeOnWindow(
			currentGenome,
			ws,
			backendFactory
		);
		currentGenome = result.updatedGenome;
		allRaw.push(...result.rawScores);
		allPnL.push(result.finalPnL);
	}

	return _computeAllResults({ genome, currentGenome, allRaw, allPnL, t0 });
}

/**
 * Parallel evaluation with bounded concurrency.
 */
export async function pooledEval<TItem, TResult>(
	items: TItem[],
	concurrency: number,
	fn: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
	const results: TResult[] = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			results[i] = await fn(items[i]);
		}
	}

	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		worker
	);
	await Promise.all(workers);
	return results;
}
