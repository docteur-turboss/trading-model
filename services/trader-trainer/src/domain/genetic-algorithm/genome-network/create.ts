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

/** `inputDim`: the size of the encoded steps plus the agent state, when the steps carry signal inputs. */
export function createNetworkGenome(
	eventDriven = false,
	inputDim: number = NETWORK_INPUT_LAYOUT.dim,
	maskGroups = 0
): NetworkGenome {
	return {
		inputDim: PositiveInt.of(inputDim + (eventDriven ? 1 : 0)),
		outputDim: PositiveInt.of(3),
		hiddenLayers: _createDefaultHiddenLayers(),
		normalization: NormalisationType.None,
		...(maskGroups > 0 && { inputMask: new Array(maskGroups).fill(true) }),
	};
}
