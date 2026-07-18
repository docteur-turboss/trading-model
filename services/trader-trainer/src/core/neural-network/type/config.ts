import { NumericRange } from "@trading-model/common/domain/numeric-range";
import {
	Percentage,
	type PositiveInt,
} from "@trading-model/common/domain/primitives";
import type { OptimizerHyperparams } from "../optimizer";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "./enums";

export type NeuronsByLayer = PositiveInt[];

export interface NetworkArchitecture {
	neuronsByLayer: NeuronsByLayer;
	activationType?: ActivationType[];
	connectionType?: ConnectionType;
	normalisationType?: NormalisationType;
	normalizedInputRange?: NumericRange;
	enablePool?: boolean;
	poolMaxSize?: PositiveInt;
}

export interface LossConfig {
	lossFunctionType?: LossFunctionType;
	deltaHuber?: PositiveInt;
}

export interface OptimizerConfig {
	optimizerType?: OptimizerType;
	optimizerHyperparams?: Partial<OptimizerHyperparams>;
	learningRate?: Percentage;
	gradientClipNorm?: number;
}

export interface NetworkInitConfig {
	initialisationType?: InitialisationType;
	useBias?: boolean;
	biasInitialisationType?: InitialisationType;
}

export interface MutationConfig {
	biasMutationScale?: Percentage;
	weightMutationScale?: Percentage;
}

export interface NeuralNetworkConfig
	extends NetworkArchitecture,
		LossConfig,
		OptimizerConfig,
		NetworkInitConfig,
		MutationConfig {}

function _resolveActivationType(
	cfg: NeuralNetworkConfig
): Required<NeuralNetworkConfig>["activationType"] {
	return (
		cfg.activationType ??
		new Array(cfg.neuronsByLayer.length - 1).fill(ActivationType.Relu)
	);
}

function _resolveBiasInit(
	cfg: NeuralNetworkConfig
): Required<NeuralNetworkConfig>["biasInitialisationType"] {
	return (
		cfg.biasInitialisationType ??
		cfg.initialisationType ??
		InitialisationType.Random
	);
}

export function mergeConfig(
	cfg: NeuralNetworkConfig
): Required<NeuralNetworkConfig> {
	return {
		useBias: cfg.useBias ?? true,
		deltaHuber: (cfg.deltaHuber ?? 1) as PositiveInt,
		enablePool: cfg.enablePool ?? true,
		neuronsByLayer: cfg.neuronsByLayer,
		poolMaxSize: (cfg.poolMaxSize ?? 10_000) as PositiveInt,
		learningRate: cfg.learningRate ?? Percentage.of(0.001),
		optimizerType: cfg.optimizerType ?? OptimizerType.Sgd,
		gradientClipNorm: cfg.gradientClipNorm ?? 5.0,
		biasMutationScale: Percentage.of(cfg.biasMutationScale ?? 0.05),
		normalisationType: cfg.normalisationType ?? NormalisationType.None,
		weightMutationScale: Percentage.of(cfg.weightMutationScale ?? 0.1),
		optimizerHyperparams: cfg.optimizerHyperparams ?? {},
		initialisationType: cfg.initialisationType ?? InitialisationType.Random,
		connectionType: cfg.connectionType ?? ConnectionType.FullyConnected,
		lossFunctionType: cfg.lossFunctionType ?? LossFunctionType.MeanSquaredError,
		normalizedInputRange:
			cfg.normalizedInputRange ??
			new NumericRange(0, cfg.neuronsByLayer[0] - 1),
		biasInitialisationType: _resolveBiasInit(cfg),
		activationType: _resolveActivationType(cfg),
	};
}
