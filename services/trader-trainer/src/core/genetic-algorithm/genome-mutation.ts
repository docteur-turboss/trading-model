import { Percentage } from "@trading-model/common/domain/primitives";
import type { NoiseStd } from "@trading-model/common/domain/primitives/noise-std";

export enum MutationDistribution {
	Gaussian = "gaussian",
	Levy = "levy",
	Uniform = "uniform",
	Cauchy = "cauchy",
}

export enum MutationAdaptation {
	Fixed = "fixed",
	SigmaAdaptive = "sigma_adaptive",
	SelfAdaptive = "self_adaptive",
	Cma = "cma",
}

export enum MutationScope {
	Global = "global",
	PerLayer = "per_layer",
	Correlated = "correlated",
}

export interface MutationRates {
	rate: Percentage;
	sigma: Percentage;
	noiseStd: NoiseStd;
	selfSigma: Percentage;
	activationMutationRate: Percentage;
}

export interface MutationStructural {
	addNeuronRate: Percentage;
	removeNeuronRate: Percentage;
	addLayerRate: Percentage;
	removeLayerRate: Percentage;
	addConnectionRate: Percentage;
	removeConnectionRate: Percentage;
}

export interface MutationGenome {
	rates: MutationRates;
	structural: MutationStructural;
	distribution: MutationDistribution;
	adaptation: MutationAdaptation;
	scope: MutationScope;
	mutateActivations: boolean;
	mutateHyperparams: boolean;
}

export function createMutationGenome(): MutationGenome {
	return {
		rates: {
			rate: Percentage.of(0.1),
			sigma: Percentage.of(0.05),
			noiseStd: 0.02,
			selfSigma: Percentage.of(0.05),
			activationMutationRate: Percentage.of(0.05),
		},
		structural: {
			addNeuronRate: Percentage.of(0.01),
			removeNeuronRate: Percentage.of(0.01),
			addLayerRate: Percentage.of(0.005),
			removeLayerRate: Percentage.of(0.005),
			addConnectionRate: Percentage.of(0.01),
			removeConnectionRate: Percentage.of(0.01),
		},
		distribution: MutationDistribution.Gaussian,
		adaptation: MutationAdaptation.Fixed,
		scope: MutationScope.Global,
		mutateActivations: false,
		mutateHyperparams: true,
	} as MutationGenome;
}
