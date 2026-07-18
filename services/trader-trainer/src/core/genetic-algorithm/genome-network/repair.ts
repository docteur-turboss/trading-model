import type { PositiveInt } from "@trading-model/common/domain/primitives";
import {
	VALID_ACTIVATIONS,
	VALID_BIAS_TYPES,
	VALID_CONNECTION_TYPES,
	VALID_NORM_TYPES,
} from "../genome-validation/utils";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	type LayerGenome,
	type NetworkGenome,
	NormalisationType,
} from "./types";

function _createDefaultHiddenLayer(): LayerGenome {
	return {
		neurons: 32 as PositiveInt,
		activation: ActivationType.Relu,
		connectionType: ConnectionType.DenseSkip,
		biasType: InitialisationType.Zeros,
	};
}

function repairLayer(layer: LayerGenome): LayerGenome {
	return {
		neurons: Math.max(1, Math.round(layer.neurons ?? 32)) as PositiveInt,
		activation: VALID_ACTIVATIONS.has(layer.activation)
			? layer.activation
			: ActivationType.Relu,
		connectionType: VALID_CONNECTION_TYPES.has(layer.connectionType)
			? layer.connectionType
			: ConnectionType.DenseSkip,
		biasType: VALID_BIAS_TYPES.has(layer.biasType)
			? layer.biasType
			: InitialisationType.Zeros,
	};
}

function _repairHiddenLayers(network: NetworkGenome): LayerGenome[] {
	const layers = (
		Array.isArray(network.hiddenLayers) ? network.hiddenLayers : []
	).map(repairLayer);
	return layers.length > 0 ? layers : [_createDefaultHiddenLayer()];
}

export function repairNetwork(network: NetworkGenome): NetworkGenome {
	return {
		inputDim: Math.max(1, Math.round(network.inputDim ?? 1)) as PositiveInt,
		outputDim: Math.max(1, Math.round(network.outputDim ?? 1)) as PositiveInt,
		hiddenLayers: _repairHiddenLayers(network),
		normalization: VALID_NORM_TYPES.has(network.normalization)
			? network.normalization
			: NormalisationType.None,
	};
}
