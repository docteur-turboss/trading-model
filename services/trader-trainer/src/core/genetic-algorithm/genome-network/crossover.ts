import type { PositiveInt } from "@trading-model/common/domain/primitives";
import { crossoverScalar } from "../crossover/strategies";
import type { CrossoverGenome } from "../genome-control";
import type { LayerGenome, NetworkGenome } from "./types";

function _crossoverLayerPair(
	layerLeft: LayerGenome,
	layerRight: LayerGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): LayerGenome {
	return {
		neurons: Math.round(
			crossoverFn(layerLeft.neurons, layerRight.neurons)
		) as PositiveInt,
		activation: rng() < 0.5 ? layerLeft.activation : layerRight.activation,
		connectionType:
			rng() < 0.5 ? layerLeft.connectionType : layerRight.connectionType,
		biasType: rng() < 0.5 ? layerLeft.biasType : layerRight.biasType,
	};
}

function _crossoverExcessLayer(
	longer: LayerGenome[],
	idx: number,
	rng: () => number
): LayerGenome | null {
	return rng() < 0.5 ? { ...longer[idx] } : null;
}

function _crossoverHiddenLayers(
	minLen: number,
	maxLen: number,
	longer: LayerGenome[],
	left: NetworkGenome,
	right: NetworkGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): LayerGenome[] {
	const hiddenLayers: LayerGenome[] = [];
	for (let i = 0; i < maxLen; i++) {
		if (i >= minLen) {
			const layer = _crossoverExcessLayer(longer, i, rng);
			if (layer) {
				hiddenLayers.push(layer);
			}
		} else {
			hiddenLayers.push(
				_crossoverLayerPair(
					left.hiddenLayers[i],
					right.hiddenLayers[i],
					crossoverFn,
					rng
				)
			);
		}
	}
	return hiddenLayers;
}

export function crossoverNetwork(ctx: {
	left: NetworkGenome;
	right: NetworkGenome;
	co: CrossoverGenome;
	rng: () => number;
}): NetworkGenome {
	const { left, right, co, rng } = ctx;
	const minLen = Math.min(left.hiddenLayers.length, right.hiddenLayers.length);
	const maxLen = Math.max(left.hiddenLayers.length, right.hiddenLayers.length);
	const longer =
		left.hiddenLayers.length >= right.hiddenLayers.length
			? left.hiddenLayers
			: right.hiddenLayers;

	const crossoverFn = (valueA: number, valueB: number) =>
		crossoverScalar({ left: valueA, right: valueB, co, rng });

	return {
		...left,
		hiddenLayers: _crossoverHiddenLayers(
			minLen,
			maxLen,
			longer,
			left,
			right,
			crossoverFn,
			rng
		),
		normalization: rng() < 0.5 ? left.normalization : right.normalization,
	};
}
