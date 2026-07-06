import { crossoverGenomes } from "./crossover";
import {
	crossoverWeights,
	type MutateWeightsContext,
	mutateWeights,
} from "./evolution-engine";
import type { GAControlGenome, Genome, LamarckGenome } from "./genome-types";
import { mutateGenome } from "./mutation";
import { makePRNG } from "./prng";
import { selectParent } from "./selection";
import { type DeepReadonly, deepFreeze, withGenome } from "./shared-types";
import { generateId } from "./utils";

export function selectElites(
	ranked: Genome[],
	newCtrl: Readonly<GAControlGenome>
): DeepReadonly<LamarckGenome>[] {
	const nElite = Math.max(
		1,
		Math.round(newCtrl.elitismFraction * newCtrl.populationSize)
	);
	return ranked
		.slice(0, nElite)
		.map((genome) =>
			withGenome(genome, { gaControl: newCtrl } as Partial<LamarckGenome>)
		);
}

interface ProduceOneOffspringParams {
	ranked: LamarckGenome[];
	newCtrl: Readonly<GAControlGenome>;
	coRng: () => number;
	mutRng: () => number;
	rng: () => number;
	generation: number;
}

function _crossoverAndMutateWeights(
	pA: LamarckGenome,
	pB: LamarckGenome,
	newCtrl: Readonly<GAControlGenome>,
	coRng: () => number,
	mutRng: () => number
): Float32Array | undefined {
	if (!(pA.trainedWeights && pB.trainedWeights)) {
		return;
	}
	const childWeightsCtx: MutateWeightsContext = {
		weights: crossoverWeights(
			pA.trainedWeights as Float32Array,
			pB.trainedWeights as Float32Array,
			coRng
		),
		rate: newCtrl.mutationRate ?? 0.1,
		std: newCtrl.mutationStd ?? 0.05,
		rng: mutRng,
	};
	return mutateWeights(childWeightsCtx);
}

function _buildOffspringGenome(
	childStruct: LamarckGenome,
	newCtrl: Readonly<GAControlGenome>,
	generation: number,
	childWeights: Float32Array | undefined
): DeepReadonly<LamarckGenome> {
	return deepFreeze({
		...childStruct,
		id: generateId(),
		generation: generation + 1,
		gaControl: newCtrl,
		trainedWeights: childWeights,
		fitness: undefined,
		fitnessMeta: undefined,
	}) as DeepReadonly<LamarckGenome>;
}

function produceOneOffspring(
	params: ProduceOneOffspringParams
): DeepReadonly<LamarckGenome> {
	const { ranked, newCtrl, coRng, mutRng, rng, generation } = params;
	const pA = selectParent(ranked, newCtrl.selectionType, rng);
	const pB = selectParent(ranked, newCtrl.selectionType, rng);

	const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);
	const childWeights = _crossoverAndMutateWeights(
		pA,
		pB,
		newCtrl,
		coRng,
		mutRng
	);

	return _buildOffspringGenome(childStruct, newCtrl, generation, childWeights);
}

export interface OffspringContext {
	ranked: Genome[];
	newCtrl: Readonly<GAControlGenome>;
	ctrl: DeepReadonly<GAControlGenome>;
	rng: () => number;
	generation: number;
}

function _computeOffspringCount(newCtrl: Readonly<GAControlGenome>): number {
	const nElite = Math.max(
		1,
		Math.round(newCtrl.elitismFraction * newCtrl.populationSize)
	);
	return newCtrl.populationSize - nElite;
}

function _makeOffspringRngs(
	ctrl: DeepReadonly<GAControlGenome>,
	generation: number
): { mutRng: () => number; coRng: () => number } {
	return {
		mutRng: makePRNG(ctrl.mutationSeed + generation + 1000),
		coRng: makePRNG(ctrl.mutationSeed + generation + 2000),
	};
}

export function createOffspring(
	ctx: OffspringContext
): DeepReadonly<LamarckGenome>[] {
	const { ranked, newCtrl, ctrl, rng, generation } = ctx;
	const nOffspring = _computeOffspringCount(newCtrl);
	const { mutRng, coRng } = _makeOffspringRngs(ctrl, generation);

	return Array.from({ length: nOffspring }, () =>
		produceOneOffspring({
			ranked: ranked as LamarckGenome[],
			newCtrl,
			coRng,
			mutRng,
			rng,
			generation,
		})
	);
}
