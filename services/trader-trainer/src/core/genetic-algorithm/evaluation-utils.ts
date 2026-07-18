import {
	DurationMs,
	PositiveInt,
	Ratio,
} from "@trading-model/common/domain/primitives";

import {
	computeAdjustedFitness,
	estimateComplexity,
} from "./complexity-estimator";
import { EpisodeScores } from "./episode-scores";
import type { GenomeFitnessMeta } from "./genome";
import type { LamarckGenome } from "./genome-types";
import type { RLBackend } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

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

function computeFitness(scores: number[]): number {
	if (scores.length === 0) {
		return 0;
	}
	return new EpisodeScores(scores).mean();
}

export interface ComputeAllResultsContext {
	genome: DeepReadonly<LamarckGenome>;
	currentGenome: DeepReadonly<LamarckGenome>;
	allRaw: number[];
	allPnL: number[];
	t0: number;
}

export function computeAllResults(ctx: ComputeAllResultsContext): {
	updatedGenome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
	objectives: { avgPnl: number; sharpe: number; negFlops: number };
} {
	const { genome, currentGenome, allRaw, allPnL, t0 } = ctx;
	const complexity = estimateComplexity(currentGenome);
	const adjFitness = _computeAdjustedFitnessForGenome(
		genome,
		currentGenome,
		allRaw,
		complexity
	);

	return {
		updatedGenome: currentGenome,
		meta: _buildFitnessMeta(allRaw, adjFitness, t0),
		objectives: _buildObjectives(allPnL, allRaw, complexity),
	};
}

function _computeAdjustedFitnessForGenome(
	_genome: DeepReadonly<LamarckGenome>,
	_currentGenome: DeepReadonly<LamarckGenome>,
	allRaw: number[],
	complexity: ReturnType<typeof estimateComplexity>
): number {
	const fitness = computeFitness(allRaw);
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
		computeMs: DurationMs.of(Date.now() - t0),
		efficiencyScore: Ratio.of(Number.isFinite(adjFitness) ? adjFitness : 0),
		variance: scores.variance(),
		rawScores: scores,
	};
}

function _buildObjectives(
	allPnL: number[],
	allRaw: number[],
	complexity: { inferenceFLOPs: number }
): { avgPnl: number; sharpe: number; negFlops: number } {
	return {
		avgPnl: allPnL.reduce((sum, value) => sum + value, 0) / allPnL.length,
		sharpe: new EpisodeScores(allRaw).sharpe(),
		negFlops: -complexity.inferenceFLOPs,
	};
}
