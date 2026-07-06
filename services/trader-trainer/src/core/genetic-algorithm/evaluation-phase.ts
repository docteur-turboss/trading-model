import { NormalizationStats } from "../normalization-stats";
import type { DeepReadonly } from "./shared-types";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { BackendFactory, RLBackend } from "./rl-backend";
import { _stepAndShapeReward } from "./reward-shaping";

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
		epReward += _stepAndShapeReward(
			backend,
			validationData[index],
			rShape,
			runStats
		);
	}

	return _finalizeEpisodeReward(backend, rShape, epReward);
}

function _finalizeEpisodeReward(
	backend: RLBackend,
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	epReward: number
): number {
	if (rShape.sparse) {
		epReward = backend.getPnL();
	}
	backend.resetEpisode();
	return epReward;
}

export interface EvaluationResult {
	updatedGenome: DeepReadonly<LamarckGenome>;
	rawScores: number[];
	finalPnL: number;
}

export function evalPhase(
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
