import { PositiveInt, Ratio } from "@trading-model/common/domain/primitives";
import {
	computeAdjustedFitness,
	estimateComplexity,
} from "./complexity-estimator";
import { EpisodeScores } from "./episode-scores";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { RLBackend } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import { computeSharpe } from "./utils";

export interface GenomeFitnessMeta {
	episodesRun: PositiveInt;
	computeMs: number;
	efficiencyScore: Ratio;
	variance: number;
	rawScores: EpisodeScores;
}

export function lamarckianUpdate(
	genome: DeepReadonly<LamarckGenome>,
	backend: RLBackend
): DeepReadonly<LamarckGenome> {
	const snapshot = backend.getWeights().slice();
	return {
		...genome,
		trainedWeights: snapshot,
	} as DeepReadonly<LamarckGenome>;
}

export function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
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

function computeFitness(_fitnessType: string, scores: number[]): number {
	if (scores.length === 0) {
		return 0;
	}
	return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`[Invariant] ${message}`);
	}
}

export function _validateGenomeInputs(
	genome: DeepReadonly<LamarckGenome>,
	windowSet: { id: string; train: MarketStep[]; validation: MarketStep[] }
): void {
	invariant(genome.network.inputDim > 0, "inputDim must be positive");
	invariant(genome.network.outputDim > 0, "outputDim must be positive");
	invariant(
		genome.rl.rewardShaping?.clipBounds !== null &&
			typeof genome.rl.rewardShaping.clipBounds.min === "number" &&
			typeof genome.rl.rewardShaping.clipBounds.max === "number",
		"rewardShaping.clipBounds must have numeric min/max"
	);
	invariant(windowSet.train.length > 0, "windowSet.train must not be empty");
	invariant(
		windowSet.validation.length > 0,
		"windowSet.validation must not be empty"
	);
}

export function _validateEvalResult(result: {
	rawScores: number[];
	finalPnL: number;
}): void {
	invariant(
		Number.isFinite(result.finalPnL),
		`finalPnL must be finite, got ${result.finalPnL}`
	);
	for (const score of result.rawScores) {
		invariant(Number.isFinite(score), `rawScore must be finite, got ${score}`);
	}
}

export interface ComputeAllResultsContext {
	genome: DeepReadonly<LamarckGenome>;
	currentGenome: DeepReadonly<LamarckGenome>;
	allRaw: number[];
	allPnL: number[];
	t0: number;
}

function _computeAdjustedFitnessForGenome(
	genome: DeepReadonly<LamarckGenome>,
	currentGenome: DeepReadonly<LamarckGenome>,
	allRaw: number[]
): number {
	const complexity = estimateComplexity(currentGenome);
	const fitness = computeFitness(genome.gaControl.fitnessType, allRaw);
	return computeAdjustedFitness(fitness, complexity, 0.15);
}

function _buildFitnessMeta(
	allRaw: number[],
	adjFitness: number,
	t0: number
): GenomeFitnessMeta {
	const scores = new EpisodeScores(allRaw);
	return {
		episodesRun: PositiveInt.of(Math.max(1, scores.length)),
		computeMs: Date.now() - t0,
		efficiencyScore: Ratio.of(Number.isFinite(adjFitness) ? adjFitness : 0),
		variance: scores.variance(),
		rawScores: scores,
	};
}

function _buildObjectives(
	allPnL: number[],
	allRaw: number[],
	complexity: import("./complexity-estimator").ComplexityProfile
): { avgPnl: number; sharpe: number; negFlops: number } {
	return {
		avgPnl: allPnL.reduce((sum, value) => sum + value, 0) / allPnL.length,
		sharpe: computeSharpe(allRaw),
		negFlops: -complexity.inferenceFLOPs,
	};
}

export function _computeAllResults(ctx: ComputeAllResultsContext): {
	updatedGenome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
	objectives: { avgPnl: number; sharpe: number; negFlops: number };
} {
	const { genome, currentGenome, allRaw, allPnL, t0 } = ctx;
	const complexity = estimateComplexity(currentGenome);
	const adjFitness = _computeAdjustedFitnessForGenome(
		genome,
		currentGenome,
		allRaw
	);

	return {
		updatedGenome: currentGenome,
		meta: _buildFitnessMeta(allRaw, adjFitness, t0),
		objectives: _buildObjectives(allPnL, allRaw, complexity),
	};
}
