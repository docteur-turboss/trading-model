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

export function validateLayer(
	ctx: ValidationContext,
	layer: LayerGenome
): void {
	checkPositiveInt({ ...ctx, path: `${ctx.path}.neurons` }, layer.neurons);
	if (!VALID_ACTIVATIONS.has(layer.activation)) {
		err(
			{ ...ctx, path: `${ctx.path}.activation` },
			"unknown activation type",
			layer.activation
		);
	}
	if (!VALID_CONNECTION_TYPES.has(layer.connectionType)) {
		err(
			{ ...ctx, path: `${ctx.path}.connectionType` },
			"unknown connection type",
			layer.connectionType
		);
	}
	if (!VALID_BIAS_TYPES.has(layer.biasType)) {
		err(
			{ ...ctx, path: `${ctx.path}.biasType` },
			"unknown bias type",
			layer.biasType
		);
	}
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

export function repairNetwork(network: NetworkGenome): NetworkGenome {
	let hiddenLayers: LayerGenome[] = (
		Array.isArray(network.hiddenLayers) ? network.hiddenLayers : []
	).map((layer) => repairLayer(layer));

	if (hiddenLayers.length === 0) {
		hiddenLayers = [
			{
				neurons: 32,
				activation: ActivationType.Relu,
				connectionType: ConnectionType.DenseSkip,
				biasType: InitialisationType.Zeros,
			},
		];
	}

	return {
		inputDim: Math.max(1, Math.round(network.inputDim ?? 1)),
		outputDim: Math.max(1, Math.round(network.outputDim ?? 1)),
		hiddenLayers,
		normalization: VALID_NORM_TYPES.has(network.normalization)
			? network.normalization
			: NormalisationType.None,
	};
}
