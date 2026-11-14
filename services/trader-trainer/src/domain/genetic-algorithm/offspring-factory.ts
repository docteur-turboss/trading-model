import { makePRNG } from "@trading-model/crypto/domain/services/prng";
import { crossoverGenomes } from "./crossover/genome-crossover";
import {
	crossoverWeights,
	type MutateWeightsContext,
	mutateWeights,
} from "./evolution-engine";
import type { GaTelemetry } from "./ga-telemetry";
import type { GAControlGenome, LamarckGenome, PopMember } from "./genome";
import { mutateGenome } from "./mutation/mutate";
import { selectParent } from "./selection";
import { type DeepReadonly, deepFreeze, withGenome } from "./shared-types";
import { makeGenomeId } from "./utils";

function eliteCount(ctrl: DeepReadonly<GAControlGenome>): number {
	return Math.max(
		1,
		Math.round(ctrl.population.elitismFraction * ctrl.population.size)
	);
}

export function selectElites(
	ranked: PopMember[],
	newCtrl: DeepReadonly<GAControlGenome>
): DeepReadonly<LamarckGenome>[] {
	const nElite = eliteCount(newCtrl);
	return ranked.slice(0, nElite).map((member) =>
		withGenome(member.genome, {
			gaControl: newCtrl,
		} as Partial<LamarckGenome>)
	);
}

interface ProduceOneOffspringParams {
	ranked: PopMember[];
	newCtrl: DeepReadonly<GAControlGenome>;
	coRng: () => number;
	mutRng: () => number;
	rng: () => number;
	generation: number;
	index: number;
	onFallback: () => void;
}

interface CrossoverAndMutateWeightsParams {
	pA: LamarckGenome;
	pB: LamarckGenome;
	newCtrl: DeepReadonly<GAControlGenome>;
	coRng: () => number;
	mutRng: () => number;
	onFallback: () => void;
}

function _crossoverAndMutateWeights(
	params: CrossoverAndMutateWeightsParams
): Float32Array | undefined {
	const { pA, pB, newCtrl, coRng, mutRng, onFallback } = params;
	if (!(pA.trainedWeights && pB.trainedWeights)) {
		return;
	}
	const childWeightsCtx: MutateWeightsContext = {
		weights: crossoverWeights(
			pA.trainedWeights as Float32Array,
			pB.trainedWeights as Float32Array,
			coRng,
			onFallback
		),
		rate: newCtrl.mutationRate ?? 0.1,
		std: newCtrl.mutationStd ?? 0.05,
		rng: mutRng,
	};
	return mutateWeights(childWeightsCtx);
}

function _buildOffspringGenome(
	childStruct: LamarckGenome,
	newCtrl: DeepReadonly<GAControlGenome>,
	generation: number,
	index: number,
	childWeights: Float32Array | undefined
): DeepReadonly<LamarckGenome> {
	return deepFreeze({
		...childStruct,
		id: makeGenomeId(generation + 1, index),
		generation: generation + 1,
		gaControl: newCtrl,
		trainedWeights: childWeights,
	}) as DeepReadonly<LamarckGenome>;
}

function produceOneOffspring(
	params: ProduceOneOffspringParams
): DeepReadonly<LamarckGenome> {
	const { ranked, newCtrl, coRng, mutRng, rng, generation, index, onFallback } =
		params;
	const pA = selectParent(ranked, rng);
	const pB = selectParent(ranked, rng);

	const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);
	const childWeights = _crossoverAndMutateWeights({
		pA,
		pB,
		newCtrl,
		coRng,
		mutRng,
		onFallback,
	});

	return _buildOffspringGenome(
		childStruct,
		newCtrl,
		generation,
		index,
		childWeights
	);
}

export interface OffspringContext {
	ranked: PopMember[];
	newCtrl: DeepReadonly<GAControlGenome>;
	ctrl: DeepReadonly<GAControlGenome>;
	rng: () => number;
	generation: number;
	/** Receives the generation's count of weight-length fallbacks (once, when > 0). */
	telemetry?: GaTelemetry;
}

function _computeOffspringCount(
	newCtrl: DeepReadonly<GAControlGenome>
): number {
	const nElite = eliteCount(newCtrl);
	return newCtrl.population.size - nElite;
}

function _makeOffspringRngs(
	ctrl: DeepReadonly<GAControlGenome>,
	generation: number
): { mutRng: () => number; coRng: () => number } {
	return {
		mutRng: makePRNG(ctrl.seeding.mutationSeed + generation + 1000),
		coRng: makePRNG(ctrl.seeding.mutationSeed + generation + 2000),
	};
}

export function createOffspring(
	ctx: OffspringContext
): DeepReadonly<LamarckGenome>[] {
	const { ranked, newCtrl, ctrl, rng, generation, telemetry } = ctx;
	const nOffspring = _computeOffspringCount(newCtrl);
	const { mutRng, coRng } = _makeOffspringRngs(ctrl, generation);
	let fallbacks = 0;
	const onFallback = (): void => {
		fallbacks++;
	};

	const offspring = Array.from({ length: nOffspring }, (_unused, index) =>
		produceOneOffspring({
			ranked,
			newCtrl,
			coRng,
			mutRng,
			rng,
			generation,
			index,
			onFallback,
		})
	);
	if (fallbacks > 0) {
		telemetry?.crossoverFallbacks(fallbacks);
	}
	return offspring;
}
