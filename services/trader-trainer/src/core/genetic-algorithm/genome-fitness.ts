import type {
	DurationMs,
	Fitness,
	GenomeId,
	PositiveInt,
	Price,
	Ratio,
} from "@trading-model/common/domain/primitives";
import type { FeatureVector } from "../feature-vector.js";
import type { EpisodeScores } from "./episode-scores";
import type { CrossoverGenome, GAControlGenome } from "./genome-control";
import type { MutationGenome } from "./genome-mutation";
import type { NetworkGenome } from "./genome-network";
import { ActivationType } from "./genome-network";
import type { RLGenome } from "./genome-rl";
import type { DeepReadonly } from "./shared-types";

export interface GenomeFitnessMeta {
	episodesRun: PositiveInt;
	computeMs: DurationMs;
	efficiencyScore: Ratio;
	variance: number;
	rawScores: EpisodeScores;
}

export interface Genome {
	id: GenomeId;
	generation: PositiveInt;
	network: NetworkGenome;
	rl: RLGenome;
	mutation: MutationGenome;
	crossover: CrossoverGenome;
	gaControl: GAControlGenome;
}

export type LamarckGenome = Genome & {
	readonly trainedWeights?: Float32Array;
};

export interface PopMember {
	genome: LamarckGenome;
	fitness: Fitness;
	fitnessMeta: GenomeFitnessMeta;
}

export interface MarketStep {
	price: Price;
	features: FeatureVector;
	timestamp?: number;
}

export interface ValidationError {
	path: string;
	message: string;
	actual: unknown;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface ValidationContext {
	errors: ValidationError[];
	path: string;
}

const FlopSoftCapMacs = 5_000_000;
const MemSoftCapMb = 200_000_000;

type ActivationName = ActivationType | "linear" | "swish";

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
	inferenceFLOPs: number;
	penalty: number;
}

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

function _computePenalty(
	effectiveFlops: number,
	paramBytes: number,
	replayBytes: number
): number {
	const flopPenalty = Math.min(1, effectiveFlops / FlopSoftCapMacs);
	const memPenalty = Math.min(1, (paramBytes + replayBytes) / MemSoftCapMb);
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

	const { flops, params } = _computeLayerFlopsAndParams(
		dims,
		genome.network.hiddenLayers
	);
	const effectiveFlops = flops / Math.max(1, genome.rl.horizon.frameSkip);
	const paramBytes = params * 4;

	return {
		inferenceFLOPs: flops,
		penalty: _computePenalty(
			effectiveFlops,
			paramBytes,
			_computeReplayBytes(genome)
		),
	};
}

export function computeAdjustedFitness(
	baseFitness: number,
	complexity: ComplexityProfile,
	lambdaPenalty = 0.15
): number {
	return baseFitness * (1 - lambdaPenalty * complexity.penalty);
}
