import type { NormalizationStats } from "../normalization-stats";
import type { LamarckGenome, MarketStep } from "./genome-types";
import type { RLBackend } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";
import type { RunningStats } from "./utils";

function shapeReward(
	raw: number,
	config: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>
): number {
	let shaped = raw;
	if (config.clip) {
		shaped = Math.max(config.clipMin, Math.min(config.clipMax, shaped));
	}
	return shaped;
}

export interface PrecomputeRewardsContext {
	backend: RLBackend;
	data: MarketStep[];
	genome: DeepReadonly<LamarckGenome>;
	runStats?: RunningStats;
}

export function _computeShapedReward(
	backend: RLBackend,
	step: MarketStep,
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	runStats?: RunningStats
): number {
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
		buf[index] = _computeShapedReward(
			backend,
			data[index],
			genome.rl.rewardShaping,
			runStats
		);
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

export function _stepAndShapeReward(
	backend: RLBackend,
	step: MarketStep,
	rShape: DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>,
	runStats: NormalizationStats
): number {
	const { reward } = backend.step(step.features, step.price);
	const shaped = shapeReward(reward, rShape);

	if (rShape.normalize) {
		runStats.update(shaped);
		return runStats.normalize(shaped);
	}

	return rShape.sparse ? 0 : shaped;
}
