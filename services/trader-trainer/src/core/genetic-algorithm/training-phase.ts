import type { Experience } from "../../core/neural-network/type";
import type { DeepReadonly } from "./shared-types";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { RLBackend } from "./rl-backend";
import { nStepReturn } from "./reward-shaping";

export interface TrainPhaseContext {
	backend: RLBackend;
	trainData: MarketStep[];
	rewardBuf: Float32Array;
	genome: DeepReadonly<LamarckGenome>;
}

function _shouldSkipFrame(index: number, frameSkip: number): boolean {
	return index % frameSkip !== 0;
}

function _canTrain(pool: Experience[]): boolean {
	return pool.length >= 2;
}

function _buildTrainExperience(
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

export function trainPhase(ctx: TrainPhaseContext): void {
	const { backend, trainData, rewardBuf, genome } = ctx;
	const horizon = genome.rl.horizon;
	const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);

	for (let index = 0; index < maxT; index++) {
		if (_shouldSkipFrame(index, horizon.frameSkip)) {
			continue;
		}
		backend.step(trainData[index].features, trainData[index].price);

		const pool = backend.getExperiencePool();
		if (!_canTrain(pool)) {
			continue;
		}
		backend.train(
			_buildTrainExperience(
				pool[pool.length - 2],
				index,
				rewardBuf,
				genome,
				trainData,
				maxT
			),
			genome.rl.gamma
		);
	}
}
