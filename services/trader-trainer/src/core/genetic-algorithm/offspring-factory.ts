import type { GAControlGenome, LamarckGenome } from "./genome-types";
import { mutateGenome } from "./mutation";
import { crossoverGenomes } from "./crossover";
import { crossoverWeights, type MutateWeightsContext, mutateWeights } from "./evolution-engine";
import { selectParent } from "./selection";
import { makePRNG } from "./prng";
import { generateId } from "./utils";
import { deepFreeze, type DeepReadonly, withGenome } from "./shared-types";
import type { Genome } from "./genome-types";

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

function produceOneOffspring(
	params: ProduceOneOffspringParams
): DeepReadonly<LamarckGenome> {
	const { ranked, newCtrl, coRng, mutRng, rng, generation } = params;
	const pA = selectParent(ranked, newCtrl.selectionType, rng);
	const pB = selectParent(ranked, newCtrl.selectionType, rng);

	const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);

	let childWeights: Float32Array | undefined;
	if (pA.trainedWeights && pB.trainedWeights) {
		const rate = newCtrl.mutationRate ?? 0.1;
		const noiseStd = newCtrl.mutationStd ?? 0.05;
		const childWeightsCtx: MutateWeightsContext = {
			weights: crossoverWeights(
				pA.trainedWeights as Float32Array,
				pB.trainedWeights as Float32Array,
				coRng
			),
			rate,
			std: noiseStd,
			rng: mutRng,
		};
		childWeights = mutateWeights(childWeightsCtx);
	}

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

export interface OffspringContext {
	ranked: Genome[];
	newCtrl: Readonly<GAControlGenome>;
	ctrl: DeepReadonly<GAControlGenome>;
	rng: () => number;
	generation: number;
}

export function createOffspring(
	ctx: OffspringContext
): DeepReadonly<LamarckGenome>[] {
	const { ranked, newCtrl, ctrl, rng, generation } = ctx;
	const nElite = Math.max(
		1,
		Math.round(newCtrl.elitismFraction * newCtrl.populationSize)
	);
	const nOffspring = newCtrl.populationSize - nElite;

	const mutRng = makePRNG(ctrl.mutationSeed + generation + 1000);
	const coRng = makePRNG(ctrl.mutationSeed + generation + 2000);

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
