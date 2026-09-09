import type { MutationGenome } from "../genome-mutation";

function _coin<TValue>(
	valueA: TValue,
	valueB: TValue,
	rng: () => number
): TValue {
	return rng() < 0.5 ? valueA : valueB;
}

function _coinField<TSection, TKey extends keyof TSection>(
	left: TSection,
	right: TSection,
	key: TKey,
	rng: () => number
): TSection[TKey] {
	return _coin(left[key], right[key], rng);
}

function _crossoverRates(
	left: MutationGenome,
	right: MutationGenome,
	rng: () => number
): MutationGenome["rates"] {
	return {
		rate: _coinField(left.rates, right.rates, "rate", rng),
		sigma: _coinField(left.rates, right.rates, "sigma", rng),
		noiseStd: _coinField(left.rates, right.rates, "noiseStd", rng),
		selfSigma: _coinField(left.rates, right.rates, "selfSigma", rng),
		activationMutationRate: _coinField(
			left.rates,
			right.rates,
			"activationMutationRate",
			rng
		),
	};
}

function _crossoverStructural(
	left: MutationGenome,
	right: MutationGenome,
	rng: () => number
): MutationGenome["structural"] {
	return {
		addNeuronRate: _coinField(
			left.structural,
			right.structural,
			"addNeuronRate",
			rng
		),
		removeNeuronRate: _coinField(
			left.structural,
			right.structural,
			"removeNeuronRate",
			rng
		),
		addLayerRate: _coinField(
			left.structural,
			right.structural,
			"addLayerRate",
			rng
		),
		removeLayerRate: _coinField(
			left.structural,
			right.structural,
			"removeLayerRate",
			rng
		),
		addConnectionRate: _coinField(
			left.structural,
			right.structural,
			"addConnectionRate",
			rng
		),
		removeConnectionRate: _coinField(
			left.structural,
			right.structural,
			"removeConnectionRate",
			rng
		),
	};
}

export function crossoverMutation(
	left: MutationGenome,
	right: MutationGenome,
	rng: () => number
): MutationGenome {
	return {
		rates: _crossoverRates(left, right, rng),
		structural: _crossoverStructural(left, right, rng),
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
