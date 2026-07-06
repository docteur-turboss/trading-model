import { createDefaultGenome } from "./factory";
import type { GAControlGenome, Genome, LamarckGenome } from "./genome-types";
import { createOffspring } from "./offspring-factory";
import { type DeepReadonly, deepFreeze } from "./shared-types";

export function createInitialPopulation(
	ctrl: DeepReadonly<GAControlGenome>
): DeepReadonly<LamarckGenome>[] {
	return Array.from({ length: ctrl.populationSize }, (_unused, index) => {
		const baseGenome = createDefaultGenome(`g0_${index}`, 0) as LamarckGenome;
		return deepFreeze({
			...baseGenome,
			gaControl: ctrl,
			trainedWeights: undefined,
		}) as DeepReadonly<LamarckGenome>;
	});
}

export function buildNextPopulation(
	elites: DeepReadonly<LamarckGenome>[],
	ranked: Genome[],
	newCtrl: Readonly<GAControlGenome>,
	ctrl: DeepReadonly<GAControlGenome>,
	rng: () => number,
	generation: number
): DeepReadonly<LamarckGenome>[] {
	const offspring = createOffspring({ ranked, newCtrl, ctrl, rng, generation });
	return [...elites, ...offspring].slice(0, newCtrl.populationSize);
}
