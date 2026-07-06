// ================================================================
//                        crossover operators
// ================================================================

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
} from "./genome-types";

// ----------------------------------------------------------------
// Crossover strategy interface & implementations
// ----------------------------------------------------------------

export interface CrossoverStrategyContext {
	left: number;
	right: number;
	co: CrossoverGenome;
	rng: () => number;
}

export interface CrossoverStrategy {
	readonly type: CrossoverGenome["type"];
	crossover(ctx: CrossoverStrategyContext): number;
}

function lerpNum(first: number, second: number, blend: number): number {
	return first + (second - first) * blend;
}

class ArithmeticCrossover implements CrossoverStrategy {
	readonly type = "arithmetic" as const;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, co } = ctx;
		return lerpNum(left, right, co.blendAlpha);
	}
}

class BlendCrossover implements CrossoverStrategy {
	readonly type = "blend" as const;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, co, rng } = ctx;
		const lo = Math.min(left, right);
		const hi = Math.max(left, right);
		const diff = hi - lo;
		return lo - co.blendAlpha * diff + rng() * (diff + 2 * co.blendAlpha * diff);
	}
}

class SBXCrossover implements CrossoverStrategy {
	readonly type = "sbx" as const;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, co, rng } = ctx;
		const randomValue = rng();
		const beta =
			randomValue < 0.5
				? (2 * randomValue) ** (1 / (co.sbxEta + 1))
				: (1 / (2 * (1 - randomValue))) ** (1 / (co.sbxEta + 1));
		return 0.5 * ((1 + beta) * left + (1 - beta) * right);
	}
}

class UniformCrossover implements CrossoverStrategy {
	readonly type = "uniform" as const;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	}
}

class OnePointCrossover implements CrossoverStrategy {
	readonly type = "one_point" as const;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	}
}

class TwoPointCrossover implements CrossoverStrategy {
	readonly type = "two_point" as const;

	crossover(ctx: CrossoverStrategyContext): number {
		const { left, right, rng } = ctx;
		return rng() < 0.5 ? left : right;
	}
}

const CROSSOVER_STRATEGIES: Record<CrossoverGenome["type"], CrossoverStrategy> = {
	arithmetic: new ArithmeticCrossover(),
	blend: new BlendCrossover(),
	sbx: new SBXCrossover(),
	uniform: new UniformCrossover(),
	one_point: new OnePointCrossover(),
	two_point: new TwoPointCrossover(),
};

// ----------------------------------------------------------------
// Scalar crossover primitives
// ----------------------------------------------------------------

export interface CrossoverContext<TLeft = unknown, TRight = unknown> {
	left: TLeft;
	right: TRight;
	co: CrossoverGenome;
	rng: () => number;
}

export interface CrossoverFnContext<TLeft = unknown, TRight = unknown> {
	left: TLeft;
	right: TRight;
	crossoverFn: (valueA: number, valueB: number) => number;
	rng: () => number;
}

export interface HorizonCrossoverContext<TLeft = unknown, TRight = unknown> {
	left: TLeft;
	right: TRight;
	crossoverFn: (valueA: number, valueB: number) => number;
}

/** Crossover two scalar values using the given strategy and return the offspring. */
export function crossoverScalar(
	ctx: CrossoverContext<number, number>
): number {
	const { left, right, co, rng } = ctx;
	const strategy = CROSSOVER_STRATEGIES[co.type];
	return strategy
		? strategy.crossover({ left, right, co, rng })
		: rng() < 0.5 ? left : right;
}

// ----------------------------------------------------------------
// Sub-genome crossover helpers
// ----------------------------------------------------------------

function _crossoverLayerPair(
	layerLeft: LayerGenome,
	layerRight: LayerGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): LayerGenome {
	return {
		neurons: Math.round(crossoverFn(layerLeft.neurons, layerRight.neurons)),
		activation: rng() < 0.5 ? layerLeft.activation : layerRight.activation,
		connectionType: rng() < 0.5 ? layerLeft.connectionType : layerRight.connectionType,
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
			hiddenLayers.push(_crossoverLayerPair(left.hiddenLayers[i], right.hiddenLayers[i], crossoverFn, rng));
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
	const longer = left.hiddenLayers.length >= right.hiddenLayers.length ? left.hiddenLayers : right.hiddenLayers;

	const crossoverFn = (valueA: number, valueB: number) =>
		crossoverScalar({ left: valueA, right: valueB, co, rng });

	return {
		...left,
		hiddenLayers: _crossoverHiddenLayers(minLen, maxLen, longer, left, right, crossoverFn, rng),
		normalization: rng() < 0.5 ? left.normalization : right.normalization,
	};
}

function crossoverRewardShaping(
	ctx: CrossoverFnContext<RewardShapingGenome, RewardShapingGenome>
): RewardShapingGenome {
	const { left, right, crossoverFn, rng } = ctx;
	return {
		clip: rng() < 0.5 ? left.clip : right.clip,
		clipMin: crossoverFn(left.clipMin, right.clipMin),
		clipMax: crossoverFn(left.clipMax, right.clipMax),
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
		clipMin: crossoverFn(left.clipMin, right.clipMin),
		clipMax: crossoverFn(left.clipMax, right.clipMax),
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
): Pick<RLGenome, "gamma" | "learningRate"> {
	return {
		gamma: crossoverFn(left.gamma, right.gamma),
		learningRate: crossoverFn(left.learningRate, right.learningRate),
	};
}

function crossoverRL(
	ctx: CrossoverContext<RLGenome, RLGenome>
): RLGenome {
	const { left, right, co, rng } = ctx;
	const crossoverFn = _makeCrossoverFn(co, rng);

	return {
		..._crossoverGammaAndLR(left, right, crossoverFn),
		rewardShaping: crossoverRewardShaping({ left: left.rewardShaping, right: right.rewardShaping, crossoverFn, rng }),
		horizon: crossoverHorizon({ left: left.horizon, right: right.horizon, crossoverFn }),
		discretePolicy: crossoverDiscretePolicy({ left: left.discretePolicy, right: right.discretePolicy, crossoverFn, rng }),
		continuousPolicy: crossoverContinuousPolicy({ left: left.continuousPolicy, right: right.continuousPolicy, crossoverFn, rng }),
		replayBuffer: crossoverReplayBuffer({ left: left.replayBuffer, right: right.replayBuffer, crossoverFn, rng }),
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

// ----------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------

/** Produce a child genome via crossover of two parents, with probability governed by parent A's crossover config. */
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
		network: crossoverNetwork({ left: parentA.network, right: parentB.network, co, rng }),
		rl: crossoverRL({ left: parentA.rl, right: parentB.rl, co, rng }),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
