import {
	Percentage,
	type PositiveInt,
} from "@trading-model/primitives/primitives";
import type { OptimizerHyperparams } from "../optimizer";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	LossFunctionType,
	NormalisationType,
	OptimizerType,
} from "./enums";

type NeuronsByLayer = PositiveInt[];

export interface NetworkArchitecture {
	neuronsByLayer: NeuronsByLayer;
	activationType?: ActivationType[];
	connectionType?: ConnectionType;
	normalisationType?: NormalisationType;
	enablePool?: boolean;
	poolMaxSize?: PositiveInt;
	perEnabled?: boolean;
	perAlpha?: number;
	perBeta?: number;
	perBetaAnneal?: boolean;
	/** Uniform [0, 1) source for weight init and replay sampling; seed it to replay a run. */
	rng?: () => number;
}

export interface LossConfig {
	lossFunctionType?: LossFunctionType;
	deltaHuber?: PositiveInt;
}

interface OptimizerConfig {
	optimizerType?: OptimizerType;
	optimizerHyperparams?: Partial<OptimizerHyperparams>;
	learningRate?: Percentage;
	gradientClipNorm?: number;
}

interface NetworkInitConfig {
	initialisationType?: InitialisationType;
	useBias?: boolean;
	biasInitialisationType?: InitialisationType;
}

export interface NeuralNetworkConfig
	extends NetworkArchitecture,
		LossConfig,
		OptimizerConfig,
		NetworkInitConfig {}

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
		normalisationType: cfg.normalisationType ?? NormalisationType.None,
		optimizerHyperparams: cfg.optimizerHyperparams ?? {},
		initialisationType: cfg.initialisationType ?? InitialisationType.Random,
		connectionType: cfg.connectionType ?? ConnectionType.FullyConnected,
		lossFunctionType: cfg.lossFunctionType ?? LossFunctionType.MeanSquaredError,
		biasInitialisationType: _resolveBiasInit(cfg),
		activationType: _resolveActivationType(cfg),
		perEnabled: cfg.perEnabled ?? false,
		perAlpha: cfg.perAlpha ?? 0.6,
		perBeta: cfg.perBeta ?? 0.4,
		perBetaAnneal: cfg.perBetaAnneal ?? false,
		rng: cfg.rng ?? Math.random,
	};
}
