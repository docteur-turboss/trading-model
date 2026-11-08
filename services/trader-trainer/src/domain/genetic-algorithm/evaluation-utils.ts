import {
	DurationMs,
	PositiveInt,
	Ratio,
} from "@trading-model/primitives/primitives";
import { EpisodeScores } from "./episode-scores";
import type { EvaluationPnl } from "./evaluation-phase";
import type { GenomeFitnessMeta } from "./genome";
import { FitnessType } from "./genome-control";
import { computeAdjustedFitness, estimateComplexity } from "./genome-fitness";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { RLBackend } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

/** Fitness of a genome whose evaluation threw: below any real score. */
export const FAILED_FITNESS = -1e9;

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

type FitnessFn = (episodes: EpisodeScores, curve: EpisodeScores) => number;

/**
 * Total PnL averages the episodes; the risk ratios read the bar-by-bar PnL
 * curve, which has one point per validation bar instead of one per episode.
 */
const FITNESS_STRATEGIES: Record<FitnessType, FitnessFn> = {
	[FitnessType.TotalPnl]: (episodes) => episodes.mean(),
	[FitnessType.Sharpe]: (_episodes, curve) => curve.sharpe(),
	[FitnessType.Sortino]: (_episodes, curve) => curve.sortino(),
	[FitnessType.Calmar]: (_episodes, curve) => curve.calmar(),
	[FitnessType.Composite]: (_episodes, curve) => curve.composite(),
};

/** Scalar fitness of an evaluation under the run's fitness type. */
export function computeFitness(type: FitnessType, pnl: EvaluationPnl): number {
	if (pnl.episodePnl.length === 0) {
		return 0;
	}
	return FITNESS_STRATEGIES[type](
		new EpisodeScores(pnl.episodePnl),
		new EpisodeScores(pnl.pnlCurve)
	);
}

const MS_PER_YEAR = 365.25 * 24 * 3_600_000;

/**
 * Bars per year of the evaluated market data, from the median spacing of the
 * validation timestamps; undefined without at least two timestamped bars.
 */
export function barsPerYear(steps: readonly MarketStep[]): number | undefined {
	const gaps: number[] = [];
	for (let idx = 1; idx < steps.length; idx++) {
		const prev = steps[idx - 1].timestamp;
		const curr = steps[idx].timestamp;
		if (prev !== undefined && curr !== undefined && curr > prev) {
			gaps.push(curr - prev);
		}
	}
	if (gaps.length === 0) {
		return;
	}
	gaps.sort((left, right) => left - right);
	return MS_PER_YEAR / gaps[Math.floor(gaps.length / 2)];
}

interface ComputeAllResultsContext extends EvaluationPnl {
	currentGenome: DeepReadonly<LamarckGenome>;
	/** Annualises the published ratios; fitness itself stays per bar. */
	barsPerYear?: number;
	/** An evaluation threw: the genome gets {@link FAILED_FITNESS}. */
	failed: boolean;
	t0: number;
}

export function computeAllResults(ctx: ComputeAllResultsContext): {
	updatedGenome: DeepReadonly<LamarckGenome>;
	meta: GenomeFitnessMeta;
	objectives: { avgPnl: number; sharpe: number; negFlops: number };
} {
	const { currentGenome, failed, t0 } = ctx;
	const complexity = estimateComplexity(currentGenome);
	const adjFitness = failed
		? FAILED_FITNESS
		: computeAdjustedFitness(
				computeFitness(currentGenome.gaControl.fitnessType, ctx),
				complexity,
				0.15
			);

	const scores = new EpisodeScores(ctx.episodePnl);
	const curve = new EpisodeScores(ctx.pnlCurve);
	return {
		updatedGenome: currentGenome,
		meta: {
			episodesRun: PositiveInt.of(Math.max(1, scores.length)),
			computeMs: DurationMs.of(Date.now() - t0),
			efficiencyScore: Ratio.of(Number.isFinite(adjFitness) ? adjFitness : 0),
			variance: scores.variance(),
			rawScores: scores,
			pnlCurve: curve,
			...(ctx.barsPerYear === undefined
				? {}
				: { barsPerYear: ctx.barsPerYear }),
		},
		objectives: {
			avgPnl: failed ? FAILED_FITNESS : scores.mean(),
			sharpe: failed ? FAILED_FITNESS : curve.sharpe(),
			negFlops: -complexity.inferenceFLOPs,
		},
	};
}
