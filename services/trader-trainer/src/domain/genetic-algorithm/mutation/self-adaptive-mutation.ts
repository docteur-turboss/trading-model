import { sampleGaussian } from "@trading-model/model-runtime/noise";
import type { Percentage } from "@trading-model/primitives/primitives";
import type { MutationGenome } from "../genome-mutation";
import { clamp } from "../utils";

export function mutateSelfAdaptiveParams(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): MutationGenome {
	return {
		...mutationConfig,
		rates: {
			sigma: Math.max(
				1e-5,
				mutationConfig.rates.sigma + sampleGaussian(rng, sigma * 0.1)
			) as Percentage,
			rate: clamp(
				mutationConfig.rates.rate + sampleGaussian(rng, 0.01),
				0.001,
				0.5
			) as Percentage,
		},
	};
}
