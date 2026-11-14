/**
 * EvaluationPipeline: Orchestrates RL training and evaluation phases.
 * Trains each genome on its own experience (training-phase), keeps the
 * trained weights (Lamarckian update), then scores it on the wallet PnL of the
 * validation data (evaluation-phase).
 */

import { getLogger } from "@trading-model/contracts/logger-registry";
import type {
	EvaluationResult,
	GenomeEvaluationContext,
} from "./evaluation-phase";
import { evalPhase } from "./evaluation-phase";
import {
	barsPerYear,
	computeAllResults,
	lamarckianUpdate,
} from "./evaluation-utils";
import {
	validateEvalResult,
	validateGenomeInputs,
} from "./evaluation-validation";
import type { GaTelemetry } from "./ga-telemetry";
import type { WindowSet } from "./generation-types";
import type { GenomeFitnessMeta, LamarckGenome } from "./genome";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { deepFreeze } from "./shared-types";
import { trainPhase } from "./training-phase";

export type { GenomeFitnessMeta };

/**
 * Evaluate a single genome on a single window set.
 * Pure function (no side effects): returns new genome + scores.
 */
function evaluateSingleGenomeOnWindow(
	genome: DeepReadonly<LamarckGenome>,
	windowSet: WindowSet,
	backendFactory: BackendFactory,
	telemetry?: GaTelemetry
): EvaluationResult & { failed: boolean } {
	validateGenomeInputs(genome, windowSet);

	try {
		const trainBackend = backendFactory(genome);
		trainPhase({ backend: trainBackend, trainData: windowSet.train, genome });

		const updatedGenome = deepFreeze(lamarckianUpdate(genome, trainBackend));

		const evalCtx: GenomeEvaluationContext = {
			genome: updatedGenome,
			validationData: windowSet.validation,
			backendFactory,
		};
		const evalResult = evalPhase(evalCtx);

		validateEvalResult(evalResult);

		return { updatedGenome, ...evalResult, failed: false };
	} catch (err) {
		const reason = err instanceof Error ? err.message : "unknown";
		telemetry?.evaluationFailed(reason);
		getLogger().error("Genome evaluation failed", {
			context: { reason },
		});
		return {
			updatedGenome: genome,
			episodePnl: [],
			pnlCurve: [],
			failed: true,
		};
	}
}

/**
 * Evaluate a single genome across all window sets:
 * - Train phase on each window's training data
 * - Eval phase on each window's validation data (wallet PnL, not shaped reward)
 * - Lamarckian weight persistence across windows
 * - Returns updated genome + fitness meta + objectives
 */
export function evaluateGenomeAllWindows(
	genome: DeepReadonly<LamarckGenome>,
	windowSets: WindowSet[],
	backendFactory: BackendFactory,
	telemetry?: GaTelemetry
): Promise<{
	updatedGenome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
	objectives: { avgPnl: number; sharpe: number; negFlops: number };
}> {
	const t0 = Date.now();
	const episodePnl: number[] = [];
	const pnlCurve: number[] = [];
	let failed = false;

	let currentGenome = genome;

	for (const ws of windowSets) {
		const result = evaluateSingleGenomeOnWindow(
			currentGenome,
			ws,
			backendFactory,
			telemetry
		);
		currentGenome = result.updatedGenome;
		episodePnl.push(...result.episodePnl);
		pnlCurve.push(...result.pnlCurve);
		failed ||= result.failed;
	}

	return Promise.resolve(
		computeAllResults({
			currentGenome,
			episodePnl,
			pnlCurve,
			failed,
			t0,
			barsPerYear: barsPerYear(windowSets.flatMap((ws) => ws.validation)),
		})
	);
}

/**
 * Evaluates items one after the other on the calling thread. `fn` is CPU-bound,
 * so there is no parallelism: a generation costs the sum of its genomes, and
 * `TRAINER_TIME_BUDGET_MS` is the real limit on the generations reached.
 */
export async function sequentialEval<TItem, TResult>(
	items: TItem[],
	fn: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
	const results: TResult[] = [];
	for (const item of items) {
		results.push(await fn(item));
		// Without a macrotask yield a whole training session starves heartbeats,
		// /metrics and incoming candles.
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	return results;
}

interface EvaluateFitnessContext {
	population: DeepReadonly<LamarckGenome>[];
	windowSets: WindowSet[];
	backendFactory: BackendFactory;
	telemetry?: GaTelemetry;
}

function _makeEvalFn(
	windowSets: WindowSet[],
	backendFactory: BackendFactory,
	telemetry?: GaTelemetry
): (
	genome: DeepReadonly<LamarckGenome>
) => ReturnType<typeof evaluateGenomeAllWindows> {
	return async (genome: DeepReadonly<LamarckGenome>) => {
		const start = performance.now();
		const result = await evaluateGenomeAllWindows(
			genome,
			windowSets,
			backendFactory,
			telemetry
		);
		telemetry?.genomeEvaluated(performance.now() - start);
		return result;
	};
}

export async function evaluateFitness(ctx: EvaluateFitnessContext): Promise<{
	updatedPop: DeepReadonly<LamarckGenome>[];
	objectives: { avgPnl: number; sharpe: number; negFlops: number }[];
	metas: GenomeFitnessMeta[];
}> {
	const { population, windowSets, backendFactory, telemetry } = ctx;
	const evalResults = await sequentialEval(
		population,
		_makeEvalFn(windowSets, backendFactory, telemetry)
	);

	return {
		updatedPop: evalResults.map((result) => result.updatedGenome),
		objectives: evalResults.map((result) => result.objectives),
		metas: evalResults.map((result) => result.meta),
	};
}
