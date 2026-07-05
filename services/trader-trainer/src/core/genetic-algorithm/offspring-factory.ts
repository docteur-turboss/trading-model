import type { GAControlGenome, LamarckGenome } from "./genome-types";
import { mutateGenome } from "./mutation";
import { crossoverGenomes } from "./crossover";
import { crossoverWeights, mutateWeights } from "./evolution-engine";
import { selectParent } from "./selection";
import { makePRNG } from "./prng";
import { generateId } from "./utils";
import type { DeepReadonly } from "./shared-types";
import type { Genome } from "./genome-types";

function deepFreeze<TValue>(obj: TValue): DeepReadonly<TValue> {
	if (obj === null || typeof obj !== "object") {
		return obj as DeepReadonly<TValue>;
	}

	if (ArrayBuffer.isView(obj)) {
		return obj as DeepReadonly<TValue>;
	}

	for (const key of Object.keys(obj)) {
		const val = (obj as Record<string, unknown>)[key];
		if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
			deepFreeze(val);
		}
	}

	return Object.freeze(obj) as DeepReadonly<TValue>;
}

function withGenome<TGenome extends Genome>(
	base: DeepReadonly<TGenome>,
	patch: Partial<TGenome>
): DeepReadonly<TGenome> {
	return deepFreeze({ ...base, ...patch } as TGenome) as DeepReadonly<TGenome>;
}

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

function produceOneOffspring(
	ranked: LamarckGenome[],
	newCtrl: Readonly<GAControlGenome>,
	coRng: () => number,
	mutRng: () => number,
	rng: () => number,
	generation: number
): DeepReadonly<LamarckGenome> {
	const pA = selectParent(ranked, newCtrl.selectionType, rng);
	const pB = selectParent(ranked, newCtrl.selectionType, rng);

	const childStruct = mutateGenome(crossoverGenomes(pA, pB, coRng), mutRng);

	let childWeights: Float32Array | undefined;
	if (pA.trainedWeights && pB.trainedWeights) {
		const rate = newCtrl.mutationRate ?? 0.1;
		const noiseStd = newCtrl.mutationStd ?? 0.05;
		childWeights = mutateWeights(
			crossoverWeights(
				pA.trainedWeights as Float32Array,
				pB.trainedWeights as Float32Array,
				coRng
			),
			rate,
			noiseStd,
			mutRng
		);
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

export function createOffspring(
	ranked: Genome[],
	newCtrl: Readonly<GAControlGenome>,
	ctrl: DeepReadonly<GAControlGenome>,
	rng: () => number,
	generation: number
): DeepReadonly<LamarckGenome>[] {
	const nElite = Math.max(
		1,
		Math.round(newCtrl.elitismFraction * newCtrl.populationSize)
	);
	const nOffspring = newCtrl.populationSize - nElite;

	const mutRng = makePRNG(ctrl.mutationSeed + generation + 1000);
	const coRng = makePRNG(ctrl.mutationSeed + generation + 2000);

	return Array.from({ length: nOffspring }, () =>
		produceOneOffspring(
			ranked as LamarckGenome[],
			newCtrl,
			coRng,
			mutRng,
			rng,
			generation
		)
	);
}
