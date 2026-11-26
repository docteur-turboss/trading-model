import type { MutationGenome } from "../genome-mutation";

function _coinField<TSection, TKey extends keyof TSection>(
	left: TSection,
	right: TSection,
	key: TKey,
	rng: () => number
): TSection[TKey] {
	return rng() < 0.5 ? left[key] : right[key];
}

function _crossoverRates(
	left: MutationGenome,
	right: MutationGenome,
	rng: () => number
): MutationGenome["rates"] {
	return {
		rate: _coinField(left.rates, right.rates, "rate", rng),
		sigma: _coinField(left.rates, right.rates, "sigma", rng),
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
	};
}
