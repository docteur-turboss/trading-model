import type { NormalizationStats } from "../normalization-stats";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { RLBackend } from "./rl-backend";
import { clampToBounded } from "./bounded";
import type { DeepReadonly } from "./shared-types";
import type { RunningStats } from "./utils";

function shapeReward(
	raw: number,
	config: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>
): number {
	let shaped = raw;
	if (config.clip) {
		shaped = clampToBounded(shaped, config.clipBounds);
	}
	return shaped;
}

export interface PrecomputeRewardsContext {
	backend: RLBackend;
	data: MarketStep[];
	genome: DeepReadonly<LamarckGenome>;
	runStats?: RunningStats;
}

export interface StepRewardContext {
	backend: RLBackend;
	step: MarketStep;
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>;
	runStats?: RunningStats;
}

export function _computeShapedReward(ctx: StepRewardContext): number {
	const { backend, step, rShape, runStats } = ctx;
	const { reward } = backend.step(step.features, step.price);
	let shaped = shapeReward(reward, rShape);
	if (rShape.normalize) {
		runStats?.update(shaped);
		shaped = runStats?.normalize(shaped) ?? shaped;
	}
	return shaped;
}

export function precomputeRewards(ctx: PrecomputeRewardsContext): Float32Array {
	const { backend, data, genome, runStats } = ctx;
	const buf = new Float32Array(data.length);
	for (let index = 0; index < data.length; index++) {
		const stepCtx: StepRewardContext = {
			backend,
			step: data[index],
			rShape: genome.rl.rewardShaping,
			runStats,
		};
		buf[index] = _computeShapedReward(stepCtx);
	}
	return buf;
}

export function nStepReturn(
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

export function _stepAndShapeReward(ctx: StepRewardContext): number {
	const { backend, step, rShape, runStats } = ctx;
	const { reward } = backend.step(step.features, step.price);
	const shaped = shapeReward(reward, rShape);

	if (rShape.normalize && runStats) {
		runStats.update(shaped);
		return runStats.normalize(shaped);
	}

	return rShape.sparse ? 0 : shaped;
}
