import { NormalizationStats } from "../normalization-stats";
import type { LamarckGenome, MarketStep } from "./genome-types";
import { _stepAndShapeReward, type StepRewardContext } from "./reward-shaping";
import type { BackendFactory, RLBackend } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

export interface GenomeEvaluationContext {
	genome: DeepReadonly<LamarckGenome>;
	validationData: MarketStep[];
	backendFactory: BackendFactory;
}

function _runEvalEpisode(ctx: GenomeEvaluationContext): number {
	const { genome, validationData, backendFactory } = ctx;
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
		const stepCtx: StepRewardContext = {
			backend,
			step: validationData[index],
			rShape,
			runStats,
		};
		epReward += _stepAndShapeReward(stepCtx);
	}

	return _finalizeEpisodeReward(backend, rShape, epReward);
}

function _finalizeEpisodeReward(
	backend: RLBackend,
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	epReward: number
): number {
	if (rShape.sparse) {
		epReward = Number(backend.getPnL());
	}
	backend.resetEpisode();
	return epReward;
}

export interface EvaluationResult {
	updatedGenome: DeepReadonly<LamarckGenome>;
	rawScores: number[];
	finalPnL: number;
}

export function evalPhase(ctx: GenomeEvaluationContext): {
	rawScores: number[];
	finalPnL: number;
} {
	const numEpisodes = ctx.genome.gaControl.episodesPerIndividual;
	const rawScores: number[] = [];

	for (let ep = 0; ep < numEpisodes; ep++) {
		rawScores.push(_runEvalEpisode(ctx));
	}

	return {
		rawScores,
		finalPnL:
			rawScores.reduce((sum, value) => sum + value, 0) / rawScores.length,
	};
}
