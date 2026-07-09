import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../../neural-network/type";
import type { LayerGenome, NetworkGenome, ValidationContext } from "../genome";
import {
	checkPositiveInt,
	err,
	VALID_ACTIVATIONS,
	VALID_BIAS_TYPES,
	VALID_CONNECTION_TYPES,
	VALID_NORM_TYPES,
} from "./utils";

function _createDefaultHiddenLayer(): LayerGenome {
	return {
		neurons: 32,
		activation: ActivationType.Relu,
		connectionType: ConnectionType.DenseSkip,
		biasType: InitialisationType.Zeros,
	};
}

function _validateEnumField(
	ctx: ValidationContext,
	path: string,
	value: unknown,
	validSet: Set<unknown>,
	label: string
): void {
	if (!validSet.has(value)) {
		err({ ...ctx, path }, `unknown ${label}`, value);
	}
}

export function validateLayer(
	ctx: ValidationContext,
	layer: LayerGenome
): void {
	checkPositiveInt({ ...ctx, path: `${ctx.path}.neurons` }, layer.neurons);
	_validateEnumField(
		ctx,
		`${ctx.path}.activation`,
		layer.activation,
		VALID_ACTIVATIONS,
		"activation type"
	);
	_validateEnumField(
		ctx,
		`${ctx.path}.connectionType`,
		layer.connectionType,
		VALID_CONNECTION_TYPES,
		"connection type"
	);
	_validateEnumField(
		ctx,
		`${ctx.path}.biasType`,
		layer.biasType,
		VALID_BIAS_TYPES,
		"bias type"
	);
}

export function validateNetwork(
	ctx: ValidationContext,
	network: NetworkGenome
): void {
	checkPositiveInt({ ...ctx, path: "network.inputDim" }, network.inputDim);
	checkPositiveInt({ ...ctx, path: "network.outputDim" }, network.outputDim);
	if (
		!Array.isArray(network.hiddenLayers) ||
		network.hiddenLayers.length === 0
	) {
		err(
			{ ...ctx, path: "network.hiddenLayers" },
			"must be a non-empty array",
			network.hiddenLayers
		);
	} else {
		network.hiddenLayers.forEach((layer, index) => {
			validateLayer({ ...ctx, path: `network.hiddenLayers[${index}]` }, layer);
		});
	}
	if (!VALID_NORM_TYPES.has(network.normalization)) {
		err(
			{ ...ctx, path: "network.normalization" },
			"unknown normalization type",
			network.normalization
		);
	}
}

function repairLayer(layer: LayerGenome): LayerGenome {
	return {
		neurons: Math.max(1, Math.round(layer.neurons ?? 32)),
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
		inputDim: Math.max(1, Math.round(network.inputDim ?? 1)),
		outputDim: Math.max(1, Math.round(network.outputDim ?? 1)),
		hiddenLayers: _repairHiddenLayers(network),
		normalization: VALID_NORM_TYPES.has(network.normalization)
			? network.normalization
			: NormalisationType.None,
	};
}
