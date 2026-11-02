import { PositiveInt } from "@trading-model/primitives/primitives";
import { NETWORK_INPUT_LAYOUT } from "../../agent/agent-state";
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
		inputDim: PositiveInt.of(NETWORK_INPUT_LAYOUT.dim),
		outputDim: PositiveInt.of(3),
		hiddenLayers: _createDefaultHiddenLayers(),
		normalization: NormalisationType.None,
	};
}
