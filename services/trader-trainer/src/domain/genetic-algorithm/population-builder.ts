import type { PositiveInt } from "@trading-model/primitives/primitives";
import { createDefaultGenome } from "./factory";
import type { GAControlGenome, LamarckGenome } from "./genome";
import { createOffspring, type OffspringContext } from "./offspring-factory";
import { type DeepReadonly, deepFreeze } from "./shared-types";
import { makeGenomeId } from "./utils";

export function createInitialPopulation(
	ctrl: DeepReadonly<GAControlGenome>,
	eventDriven = false,
	inputDim?: number,
	maskGroups?: number
): DeepReadonly<LamarckGenome>[] {
	return Array.from({ length: ctrl.population.size }, (_unused, index) => {
		const baseGenome = createDefaultGenome(
			makeGenomeId(0, index),
			0 as PositiveInt,
			eventDriven,
			inputDim,
			maskGroups
		) as LamarckGenome;
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
	return [...elites, ...offspring].slice(0, ctx.newCtrl.population.size);
}
