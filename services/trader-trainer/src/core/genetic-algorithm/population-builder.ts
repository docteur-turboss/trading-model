import { createDefaultGenome } from "./factory";
import type { GAControlGenome, LamarckGenome } from "./genome-types";
import { createOffspring, type OffspringContext } from "./offspring-factory";
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
	ctx: OffspringContext
): DeepReadonly<LamarckGenome>[] {
	const offspring = createOffspring(ctx);
	return [...elites, ...offspring].slice(0, ctx.newCtrl.populationSize);
}
