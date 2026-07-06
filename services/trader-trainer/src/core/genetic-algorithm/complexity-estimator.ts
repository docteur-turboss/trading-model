/**
 * ComplexityEstimator: Estimates computational complexity (FLOPs, memory)
 * and assigns efficiency penalties for genome architectures.
 */

import { ActivationType, type LamarckGenome } from "./genome-types";

type DeepReadonly<TValue> = TValue extends (infer UItem)[]
	? readonly DeepReadonly<UItem>[]
	: TValue extends object
		? { readonly [KKey in keyof TValue]: DeepReadonly<TValue[KKey]> }
		: TValue;

const FLOP_SOFT_CAP = 5_000_000; // 5M MACs
const MEM_SOFT_CAP = 200_000_000; // 200 MB

type ActivationName = ActivationType | "linear" | "swish";

// Activation cost multipliers (rough relative cost vs linear)
const ACT_COST: Record<ActivationName, number> = {
	[ActivationType.Relu]: 1,
	[ActivationType.Sigmoid]: 4,
	[ActivationType.Tanh]: 4,
	[ActivationType.LeakyReLu]: 2,
	[ActivationType.Gelu]: 8,
	[ActivationType.Softmax]: 10,
	[ActivationType.Elu]: 3,
	[ActivationType.Mish]: 8,
	swish: 6,
	linear: 1,
};

export interface ComplexityProfile {
	inferenceFLOPs: number; // multiply-accumulate ops for one forward pass
	/** Combined penalty in [0, 1]. */
	penalty: number;
}

/**
 * Estimate computational complexity (FLOPs, memory) and efficiency penalty
 * for a given genome architecture.
 */
function _computeLayerFlopsAndParams(
	dims: number[],
	hiddenLayers: DeepReadonly<LamarckGenome["network"]["hiddenLayers"]>
): { flops: number; params: number } {
	let flops = 0;
	let params = 0;
	for (let i = 1; i < dims.length; i++) {
		const weightCount = dims[i - 1] * dims[i];
		const biasCount = dims[i];
		const act = hiddenLayers[i - 1]?.activation ?? "linear";
		flops += 2 * weightCount + biasCount * (ACT_COST[act] ?? 2);
		params += weightCount + biasCount;
	}
	return { flops, params };
}

function _computeReplayBytes(genome: DeepReadonly<LamarckGenome>): number {
	return genome.rl.replayBuffer.bufferSize * genome.network.inputDim * 4 * 2;
}

function _computePenalty(effectiveFlops: number, paramBytes: number, replayBytes: number): number {
	const flopPenalty = Math.min(1, effectiveFlops / FLOP_SOFT_CAP);
	const memPenalty = Math.min(1, (paramBytes + replayBytes) / MEM_SOFT_CAP);
	return 0.6 * flopPenalty + 0.4 * memPenalty;
}

export function estimateComplexity(
	genome: DeepReadonly<LamarckGenome>
): ComplexityProfile {
	const dims = [
		genome.network.inputDim,
		...genome.network.hiddenLayers.map((layer) => layer.neurons),
		genome.network.outputDim,
	];

	const { flops, params } = _computeLayerFlopsAndParams(dims, genome.network.hiddenLayers);
	const effectiveFlops = flops / Math.max(1, genome.rl.horizon.frameSkip);
	const paramBytes = params * 4;

	return {
		inferenceFLOPs: flops,
		penalty: _computePenalty(effectiveFlops, paramBytes, _computeReplayBytes(genome)),
	};
}

/**
 * Compute adjusted fitness considering complexity penalty.
 */
export function computeAdjustedFitness(
	baseFitness: number,
	complexity: ComplexityProfile,
	lambdaPenalty = 0.15
): number {
	return baseFitness * (1 - lambdaPenalty * complexity.penalty);
}
