import type {
	ContinuousPolicyGenome,
	CrossoverGenome,
	DiscretePolicyGenome,
	HorizonGenome,
	LamarckGenome,
	LayerGenome,
	MutationGenome,
	NetworkGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
	RLScalars,
} from "../genome-types";
import { createBounded } from "../bounded";
import { crossoverScalar } from "./strategies";

interface CrossoverContext<TLeft = unknown, TRight = unknown> {
	left: TLeft;
	right: TRight;
	co: CrossoverGenome;
	rng: () => number;
}

interface CrossoverFnContext<TLeft = unknown, TRight = unknown> {
	left: TLeft;
	right: TRight;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}

interface HorizonCrossoverContext<TLeft = unknown, TRight = unknown> {
	left: TLeft;
	right: TRight;
	crossoverFn: (valueA: number, valueB: number) => number;
}

function _crossoverLayerPair(
	layerLeft: LayerGenome,
	layerRight: LayerGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): LayerGenome {
	return {
		neurons: Math.round(crossoverFn(layerLeft.neurons, layerRight.neurons)),
		activation: rng() < 0.5 ? layerLeft.activation : layerRight.activation,
		connectionType:
			rng() < 0.5 ? layerLeft.connectionType : layerRight.connectionType,
		biasType: rng() < 0.5 ? layerLeft.biasType : layerRight.biasType,
	};
}

function _crossoverExcessLayer(
	longer: LayerGenome[],
	i: number,
	rng: () => number
): LayerGenome | null {
	return rng() < 0.5 ? { ...longer[i] } : null;
}

function _crossoverHiddenLayers(
	minLen: number,
	maxLen: number,
	longer: LayerGenome[],
	left: NetworkGenome,
	right: NetworkGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): LayerGenome[] {
	const hiddenLayers: LayerGenome[] = [];
	for (let i = 0; i < maxLen; i++) {
		if (i >= minLen) {
			const layer = _crossoverExcessLayer(longer, i, rng);
			if (layer) {
				hiddenLayers.push(layer);
			}
		} else {
			hiddenLayers.push(
				_crossoverLayerPair(
					left.hiddenLayers[i],
					right.hiddenLayers[i],
					crossoverFn,
					rng
				)
			);
		}
	}
	return hiddenLayers;
}

function crossoverNetwork(
	ctx: CrossoverContext<NetworkGenome, NetworkGenome>
): NetworkGenome {
	const { left, right, co, rng } = ctx;
	const minLen = Math.min(left.hiddenLayers.length, right.hiddenLayers.length);
	const maxLen = Math.max(left.hiddenLayers.length, right.hiddenLayers.length);
	const longer =
		left.hiddenLayers.length >= right.hiddenLayers.length
			? left.hiddenLayers
			: right.hiddenLayers;

	const crossoverFn = (valueA: number, valueB: number) =>
		crossoverScalar({ left: valueA, right: valueB, co, rng });

	return {
		...left,
		hiddenLayers: _crossoverHiddenLayers(
			minLen,
			maxLen,
			longer,
			left,
			right,
			crossoverFn,
			rng
		),
		normalization: rng() < 0.5 ? left.normalization : right.normalization,
	};
}

function crossoverRewardShaping(
	ctx: CrossoverFnContext<RewardShapingGenome, RewardShapingGenome>
): RewardShapingGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		clip: rng() < 0.5 ? left.clip : right.clip,
		clipBounds: createBounded(
			crossoverFn(left.clipBounds.min, right.clipBounds.min),
			crossoverFn(left.clipBounds.max, right.clipBounds.max),
		),
		scale: rng() < 0.5 ? left.scale : right.scale,
		scaleFactor: crossoverFn(left.scaleFactor, right.scaleFactor),
		normalize: rng() < 0.5 ? left.normalize : right.normalize,
		sparse: rng() < 0.5 ? left.sparse : right.sparse,
	};
}

function crossoverHorizon(
	ctx: HorizonCrossoverContext<HorizonGenome, HorizonGenome>
): HorizonGenome {
	const { left, right, crossoverFn } = ctx;
	return {
		maxEpisodeLength: Math.round(
			crossoverFn(left.maxEpisodeLength, right.maxEpisodeLength)
		),
		nStepReturn: Math.round(crossoverFn(left.nStepReturn, right.nStepReturn)),
		frameSkip: Math.round(crossoverFn(left.frameSkip, right.frameSkip)),
	};
}

function crossoverDiscretePolicy(
	ctx: CrossoverFnContext<DiscretePolicyGenome, DiscretePolicyGenome>
): DiscretePolicyGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		type: rng() < 0.5 ? left.type : right.type,
		epsilonStart: crossoverFn(left.epsilonStart, right.epsilonStart),
		epsilonMin: crossoverFn(left.epsilonMin, right.epsilonMin),
		epsilonDecay: crossoverFn(left.epsilonDecay, right.epsilonDecay),
		temperature: crossoverFn(left.temperature, right.temperature),
	};
}

function crossoverContinuousPolicy(
	ctx: CrossoverFnContext<ContinuousPolicyGenome, ContinuousPolicyGenome>
): ContinuousPolicyGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		type: rng() < 0.5 ? left.type : right.type,
		clipBounds: createBounded(
			crossoverFn(left.clipBounds.min, right.clipBounds.min),
			crossoverFn(left.clipBounds.max, right.clipBounds.max),
		),
		noiseStd: crossoverFn(left.noiseStd, right.noiseStd),
		noiseDecay: crossoverFn(left.noiseDecay, right.noiseDecay),
	};
}

function crossoverReplayBuffer(
	ctx: CrossoverFnContext<ReplayBufferGenome, ReplayBufferGenome>
): ReplayBufferGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		bufferSize: Math.round(crossoverFn(left.bufferSize, right.bufferSize)),
		prioritized: rng() < 0.5 ? left.prioritized : right.prioritized,
		alphaPER: crossoverFn(left.alphaPER, right.alphaPER),
		betaPER: crossoverFn(left.betaPER, right.betaPER),
		betaAnneal: rng() < 0.5 ? left.betaAnneal : right.betaAnneal,
	};
}

function _makeCrossoverFn(
	co: CrossoverGenome,
	rng: () => number
): (valueA: number, valueB: number) => number {
	return (valueA: number, valueB: number) =>
		crossoverScalar({ left: valueA, right: valueB, co, rng });
}

function _crossoverGammaAndLR(
	left: RLGenome,
	right: RLGenome,
	crossoverFn: (valueA: number, valueB: number) => number
): RLScalars {
	return {
		gamma: crossoverFn(left.gamma, right.gamma),
		learningRate: crossoverFn(left.learningRate, right.learningRate),
	};
}

function crossoverRL(ctx: CrossoverContext<RLGenome, RLGenome>): RLGenome {
	const { left, right, co, rng } = ctx;
	const crossoverFn = _makeCrossoverFn(co, rng);

	return {
		..._crossoverGammaAndLR(left, right, crossoverFn),
		rewardShaping: crossoverRewardShaping({
			left: left.rewardShaping,
			right: right.rewardShaping,
			crossoverFn,
			rng,
		}),
		horizon: crossoverHorizon({
			left: left.horizon,
			right: right.horizon,
			crossoverFn,
		}),
		discretePolicy: crossoverDiscretePolicy({
			left: left.discretePolicy,
			right: right.discretePolicy,
			crossoverFn,
			rng,
		}),
		continuousPolicy: crossoverContinuousPolicy({
			left: left.continuousPolicy,
			right: right.continuousPolicy,
			crossoverFn,
			rng,
		}),
		replayBuffer: crossoverReplayBuffer({
			left: left.replayBuffer,
			right: right.replayBuffer,
			crossoverFn,
			rng,
		}),
	};
}

function crossoverMutation(
	left: MutationGenome,
	right: MutationGenome,
	rng: () => number
): MutationGenome {
	const coin = <TValue>(valueA: TValue, valueB: TValue): TValue =>
		rng() < 0.5 ? valueA : valueB;
	return {
		rate: coin(left.rate, right.rate),
		sigma: coin(left.sigma, right.sigma),
		noiseStd: coin(left.noiseStd, right.noiseStd),
		distribution: coin(left.distribution, right.distribution),
		adaptation: coin(left.adaptation, right.adaptation),
		scope: coin(left.scope, right.scope),
		selfSigma: coin(left.selfSigma, right.selfSigma),
		mutateActivations: coin(left.mutateActivations, right.mutateActivations),
		activationMutationRate: coin(
			left.activationMutationRate,
			right.activationMutationRate
		),
		mutateHyperparams: coin(left.mutateHyperparams, right.mutateHyperparams),
		addNeuronRate: coin(left.addNeuronRate, right.addNeuronRate),
		removeNeuronRate: coin(left.removeNeuronRate, right.removeNeuronRate),
		addLayerRate: coin(left.addLayerRate, right.addLayerRate),
		removeLayerRate: coin(left.removeLayerRate, right.removeLayerRate),
		addConnectionRate: coin(left.addConnectionRate, right.addConnectionRate),
		removeConnectionRate: coin(
			left.removeConnectionRate,
			right.removeConnectionRate
		),
	};
}

export function crossoverGenomes(
	parentA: LamarckGenome,
	parentB: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const co = parentA.crossover;
	if (rng() > co.probability) {
		return { ...parentA };
	}

	return {
		...parentA,
		network: crossoverNetwork({
			left: parentA.network,
			right: parentB.network,
			co,
			rng,
		}),
		rl: crossoverRL({ left: parentA.rl, right: parentB.rl, co, rng }),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
