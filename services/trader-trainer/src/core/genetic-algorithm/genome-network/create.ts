import { PositiveInt } from "@trading-model/common/domain/primitives";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	type NetworkGenome,
	NormalisationType,
} from "./types";

function _createDefaultHiddenLayers(): NetworkGenome["hiddenLayers"] {
	return [
		{
			neurons: PositiveInt.of(64),
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		},
		{
			neurons: PositiveInt.of(32),
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		},
	];
}

export function createNetworkGenome(): NetworkGenome {
	return {
		inputDim: PositiveInt.of(32),
		outputDim: PositiveInt.of(3),
		hiddenLayers: _createDefaultHiddenLayers(),
		normalization: NormalisationType.None,
	};
}
