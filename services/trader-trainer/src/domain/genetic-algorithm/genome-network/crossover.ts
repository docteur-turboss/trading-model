import type { PositiveInt } from "@trading-model/primitives/primitives";
import { DEFAULT_ACTION_SET } from "../../agent/action-mapper";
import { crossoverInputMask } from "./input-mask";
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

interface HiddenLayerCrossoverContext {
	minLen: number;
	maxLen: number;
	longer: LayerGenome[];
	left: NetworkGenome;
	right: NetworkGenome;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}

function _crossoverHiddenLayers(
	ctx: HiddenLayerCrossoverContext
): LayerGenome[] {
	const { minLen, maxLen, longer, left, right, crossoverFn, rng } = ctx;
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
	rng: () => number;
}): NetworkGenome {
	const { left, right, rng } = ctx;
	const minLen = Math.min(left.hiddenLayers.length, right.hiddenLayers.length);
	const maxLen = Math.max(left.hiddenLayers.length, right.hiddenLayers.length);
	const longer =
		left.hiddenLayers.length >= right.hiddenLayers.length
			? left.hiddenLayers
			: right.hiddenLayers;

	// Uniform crossover: each gene comes from either parent with probability 0.5.
	const crossoverFn = (valueA: number, valueB: number) =>
		rng() < 0.5 ? valueA : valueB;

	// The child takes the action set and output layer size of one parent.
	const outputParent =
		(left.actionSet ?? DEFAULT_ACTION_SET) ===
			(right.actionSet ?? DEFAULT_ACTION_SET) || rng() < 0.5
			? left
			: right;

	const { actionSet: _leftSet, ...leftBase } = left;
	return {
		...leftBase,
		outputDim: outputParent.outputDim,
		...(outputParent.actionSet && { actionSet: outputParent.actionSet }),
		hiddenLayers: _crossoverHiddenLayers({
			minLen,
			maxLen,
			longer,
			left,
			right,
			crossoverFn,
			rng,
		}),
		normalization: rng() < 0.5 ? left.normalization : right.normalization,
		...(left.inputMask &&
			right.inputMask && {
				inputMask: crossoverInputMask(left.inputMask, right.inputMask, rng),
			}),
	};
}
