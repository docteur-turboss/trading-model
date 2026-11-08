import { Percentage } from "@trading-model/primitives/primitives";

/** Mutation noise is Gaussian, with a fixed sigma, applied layer by layer. */
interface MutationRates {
	rate: Percentage;
	sigma: Percentage;
}

interface MutationStructural {
	addNeuronRate: Percentage;
	removeNeuronRate: Percentage;
	addLayerRate: Percentage;
	removeLayerRate: Percentage;
}

export interface MutationGenome {
	rates: MutationRates;
	structural: MutationStructural;
}

export function createMutationGenome(): MutationGenome {
	return {
		rates: {
			rate: Percentage.of(0.1),
			sigma: Percentage.of(0.05),
		},
		structural: {
			addNeuronRate: Percentage.of(0.01),
			removeNeuronRate: Percentage.of(0.01),
			addLayerRate: Percentage.of(0.005),
			removeLayerRate: Percentage.of(0.005),
		},
	};
}
