import { createDefaultGenome } from "./factory";
import type { GAControlGenome, LamarckGenome } from "./genome-types";
import { deepFreeze, type DeepReadonly } from "./shared-types";

export class GaPopulationBuilder {
	freezeControl(baseControl?: Partial<GAControlGenome>): DeepReadonly<GAControlGenome> {
		return deepFreeze({
			...createDefaultGenome("base").gaControl,
			...baseControl,
		} as GAControlGenome);
	}

	createInitialPopulation(ctrl: DeepReadonly<GAControlGenome>): DeepReadonly<LamarckGenome>[] {
		return Array.from({ length: ctrl.populationSize }, (_unused, index) => {
			const baseGenome = createDefaultGenome(`g0_${index}`, 0) as LamarckGenome;
			return deepFreeze({
				...baseGenome,
				gaControl: ctrl,
				trainedWeights: undefined,
			}) as DeepReadonly<LamarckGenome>;
		});
	}
}
