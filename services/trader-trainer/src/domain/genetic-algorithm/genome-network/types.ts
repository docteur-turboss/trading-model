import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "@trading-model/model-runtime/neural-network/type";
import type { NumericRange } from "@trading-model/primitives/numeric-range";
import type { PositiveInt } from "@trading-model/primitives/primitives";

export {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
};

export type ClipBounds = NumericRange;

export interface LayerGenome {
	neurons: PositiveInt;
	activation: ActivationType;
	connectionType: ConnectionType;
	biasType: InitialisationType;
}

export interface NetworkGenome {
	inputDim: PositiveInt;
	outputDim: PositiveInt;
	hiddenLayers: LayerGenome[];
	normalization: NormalisationType;
}
