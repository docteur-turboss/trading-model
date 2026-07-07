/**
 * EvaluationPipeline: Orchestrates RL training and evaluation phases.
 * Handles reward shaping, n-step returns, shadow backends, and Lamarckian updates.
 */

import { NormalizationStats } from "../normalization-stats";
import type { EvaluationResult } from "./evaluation-phase";
import { evalPhase } from "./evaluation-phase";
import type { GenomeFitnessMeta } from "./evaluation-utils";
import {
	_computeAllResults,
	_validateEvalResult,
	_validateGenomeInputs,
	deepFreeze,
	lamarckianUpdate,
} from "./evaluation-utils";
import type { LamarckGenome, MarketStep } from "./genome-types";
import { precomputeRewards } from "./reward-shaping";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { trainPhase } from "./training-phase";

export type { EvaluationResult, GenomeFitnessMeta };

/**
 * Evaluate a single genome on a single window set.
 * Pure function (no side effects): returns new genome + scores.
 */
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
	trainPhase({
		backend: trainBackend,
		trainData: windowSet.train,
		rewardBuf,
		genome,
	});

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

	return _computeAllResults({
		genome,
		currentGenome,
		allRaw,
		allPnL,
		t0,
	});
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

export interface EvaluateFitnessContext {
	population: DeepReadonly<LamarckGenome>[];
	windowSets: {
		id: string;
		train: MarketStep[];
		validation: MarketStep[];
	}[];
	backendFactory: BackendFactory;
	concurrency: number;
}

function _makeEvalFn(
	windowSets: {
		id: string;
		train: MarketStep[];
		validation: MarketStep[];
	}[],
	backendFactory: BackendFactory
): (
	genome: DeepReadonly<LamarckGenome>
) => ReturnType<typeof evaluateGenomeAllWindows> {
	return async (genome: DeepReadonly<LamarckGenome>) =>
		evaluateGenomeAllWindows(genome, windowSets, backendFactory);
}

export async function evaluateFitness(ctx: EvaluateFitnessContext): Promise<{
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: { avgPnl: number; sharpe: number; negFlops: number }[];
	metas: GenomeFitnessMeta[];
}> {
	const { population, windowSets, backendFactory, concurrency } = ctx;
	const evalResults = await pooledEval(
		population,
		concurrency,
		_makeEvalFn(windowSets, backendFactory)
	);

	return {
		updatedPop: evalResults.map((result) => result.updatedGenome),
		objectives: evalResults.map((result) => result.objectives),
		metas: evalResults.map((result) => result.meta),
	};
}
