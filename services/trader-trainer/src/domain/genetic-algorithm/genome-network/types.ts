import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "@trading-model/model-runtime/neural-network/type";
import type { NumericRange } from "@trading-model/primitives/numeric-range";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import type { ActionSetId } from "../../agent/action-mapper";

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
	/** One output per action of `actionSet`. */
	outputDim: PositiveInt;
	/** Action space (ADR-0076); absent: `sell_hold_buy`. */
	actionSet?: ActionSetId;
	hiddenLayers: LayerGenome[];
	normalization: NormalisationType;
	/** FEATURE_INPUT_MASK_GENE (ADR-0082): per input group, false zeroes it. Absent: all active. */
	inputMask?: boolean[];
}
