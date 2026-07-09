import type { Experience } from "../../core/neural-network/type";
import type { LamarckGenome, MarketStep } from "./genome-types";
import { nStepReturn } from "./reward-shaping";
import type { RLBackend } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

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
		nextState: trainData[index].features.toFloat32Array(),
		done: index === maxT - 1,
	};
}

function _trainStep(
	index: number,
	backend: RLBackend,
	trainData: MarketStep[],
	rewardBuf: Float32Array,
	genome: DeepReadonly<LamarckGenome>,
	maxT: number
): void {
	if (_shouldSkipFrame(index, genome.rl.horizon.frameSkip)) {
		return;
	}
	backend.step(trainData[index].features, trainData[index].price);
	const pool = backend.getExperiencePool();
	if (!_canTrain(pool)) {
		return;
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

export function trainPhase(ctx: TrainPhaseContext): void {
	const { backend, trainData, rewardBuf, genome } = ctx;
	const maxT = Math.min(trainData.length, genome.rl.horizon.maxEpisodeLength);
	for (let index = 0; index < maxT; index++) {
		_trainStep(index, backend, trainData, rewardBuf, genome, maxT);
	}
}
