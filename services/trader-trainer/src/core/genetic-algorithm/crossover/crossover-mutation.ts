import type { MutationGenome } from "../genome-mutation";

function _coin<TValue>(
	valueA: TValue,
	valueB: TValue,
	rng: () => number
): TValue {
	return rng() < 0.5 ? valueA : valueB;
}

export function crossoverMutation(
	left: MutationGenome,
	right: MutationGenome,
	rng: () => number
): MutationGenome {
	return {
		rates: {
			rate: _coin(left.rates.rate, right.rates.rate, rng),
			sigma: _coin(left.rates.sigma, right.rates.sigma, rng),
			noiseStd: _coin(left.rates.noiseStd, right.rates.noiseStd, rng),
			selfSigma: _coin(left.rates.selfSigma, right.rates.selfSigma, rng),
			activationMutationRate: _coin(
				left.rates.activationMutationRate,
				right.rates.activationMutationRate,
				rng
			),
		},
		structural: {
			addNeuronRate: _coin(
				left.structural.addNeuronRate,
				right.structural.addNeuronRate,
				rng
			),
			removeNeuronRate: _coin(
				left.structural.removeNeuronRate,
				right.structural.removeNeuronRate,
				rng
			),
			addLayerRate: _coin(
				left.structural.addLayerRate,
				right.structural.addLayerRate,
				rng
			),
			removeLayerRate: _coin(
				left.structural.removeLayerRate,
				right.structural.removeLayerRate,
				rng
			),
			addConnectionRate: _coin(
				left.structural.addConnectionRate,
				right.structural.addConnectionRate,
				rng
			),
			removeConnectionRate: _coin(
				left.structural.removeConnectionRate,
				right.structural.removeConnectionRate,
				rng
			),
		},
		distribution: _coin(left.distribution, right.distribution, rng),
		adaptation: _coin(left.adaptation, right.adaptation, rng),
		scope: _coin(left.scope, right.scope, rng),
		mutateActivations: _coin(
			left.mutateActivations,
			right.mutateActivations,
			rng
		),
		mutateHyperparams: _coin(
			left.mutateHyperparams,
			right.mutateHyperparams,
			rng
		),
	};
}
