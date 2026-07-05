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

export interface CrossoverStrategy {
	readonly type: CrossoverGenome["type"];
	crossover(left: number, right: number, co: CrossoverGenome, rng: () => number): number;
}

function lerpNum(first: number, second: number, blend: number): number {
	return first + (second - first) * blend;
}

class ArithmeticCrossover implements CrossoverStrategy {
	readonly type = "arithmetic" as const;

	crossover(left: number, right: number, co: CrossoverGenome, _rng: () => number): number {
		return lerpNum(left, right, co.blendAlpha);
	}
}

class BlendCrossover implements CrossoverStrategy {
	readonly type = "blend" as const;

	crossover(left: number, right: number, co: CrossoverGenome, rng: () => number): number {
		const lo = Math.min(left, right);
		const hi = Math.max(left, right);
		const diff = hi - lo;
		return lo - co.blendAlpha * diff + rng() * (diff + 2 * co.blendAlpha * diff);
	}
}

class SBXCrossover implements CrossoverStrategy {
	readonly type = "sbx" as const;

	crossover(left: number, right: number, co: CrossoverGenome, rng: () => number): number {
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

	crossover(left: number, right: number, _co: CrossoverGenome, rng: () => number): number {
		return rng() < 0.5 ? left : right;
	}
}

class OnePointCrossover implements CrossoverStrategy {
	readonly type = "one_point" as const;

	crossover(left: number, right: number, _co: CrossoverGenome, rng: () => number): number {
		return rng() < 0.5 ? left : right;
	}
}

class TwoPointCrossover implements CrossoverStrategy {
	readonly type = "two_point" as const;

	crossover(left: number, right: number, _co: CrossoverGenome, rng: () => number): number {
		return rng() < 0.5 ? left : right;
	}
}

const CROSSOVER_STRATEGIES: Record<string, CrossoverStrategy> = {
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

/** Crossover two scalar values using the given strategy and return the offspring. */
export function crossoverScalar(
	left: number,
	right: number,
	co: CrossoverGenome,
	rng: () => number
): number {
	const strategy = CROSSOVER_STRATEGIES[co.type];
	return strategy
		? strategy.crossover(left, right, co, rng)
		: rng() < 0.5 ? left : right;
}

// ----------------------------------------------------------------
// Sub-genome crossover helpers
// ----------------------------------------------------------------

function crossoverNetwork(
	left: NetworkGenome,
	right: NetworkGenome,
	co: CrossoverGenome,
	rng: () => number
): NetworkGenome {
	const minLen = Math.min(left.hiddenLayers.length, right.hiddenLayers.length);
	const maxLen = Math.max(left.hiddenLayers.length, right.hiddenLayers.length);
	const longer =
		left.hiddenLayers.length >= right.hiddenLayers.length
			? left.hiddenLayers
			: right.hiddenLayers;

	const crossoverFn = (valueA: number, valueB: number) =>
		crossoverScalar(valueA, valueB, co, rng);

	const hiddenLayers: LayerGenome[] = [];
	for (let i = 0; i < maxLen; i++) {
		if (i >= minLen) {
			if (rng() < 0.5) {
				hiddenLayers.push({ ...longer[i] });
			}
		} else {
			const layerLeft = left.hiddenLayers[i];
			const layerRight = right.hiddenLayers[i];
			hiddenLayers.push({
				neurons: Math.round(crossoverFn(layerLeft.neurons, layerRight.neurons)),
				activation: rng() < 0.5 ? layerLeft.activation : layerRight.activation,
				connectionType:
					rng() < 0.5 ? layerLeft.connectionType : layerRight.connectionType,
				biasType: rng() < 0.5 ? layerLeft.biasType : layerRight.biasType,
			});
		}
	}

	return {
		...left,
		hiddenLayers,
		normalization: rng() < 0.5 ? left.normalization : right.normalization,
	};
}

function crossoverRewardShaping(
	left: RewardShapingGenome,
	right: RewardShapingGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): RewardShapingGenome {
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
	left: HorizonGenome,
	right: HorizonGenome,
	crossoverFn: (valueA: number, valueB: number) => number
): HorizonGenome {
	return {
		maxEpisodeLength: Math.round(
			crossoverFn(left.maxEpisodeLength, right.maxEpisodeLength)
		),
		nStepReturn: Math.round(crossoverFn(left.nStepReturn, right.nStepReturn)),
		frameSkip: Math.round(crossoverFn(left.frameSkip, right.frameSkip)),
	};
}

function crossoverDiscretePolicy(
	left: DiscretePolicyGenome,
	right: DiscretePolicyGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): DiscretePolicyGenome {
	return {
		type: rng() < 0.5 ? left.type : right.type,
		epsilonStart: crossoverFn(left.epsilonStart, right.epsilonStart),
		epsilonMin: crossoverFn(left.epsilonMin, right.epsilonMin),
		epsilonDecay: crossoverFn(left.epsilonDecay, right.epsilonDecay),
		temperature: crossoverFn(left.temperature, right.temperature),
	};
}

function crossoverContinuousPolicy(
	left: ContinuousPolicyGenome,
	right: ContinuousPolicyGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): ContinuousPolicyGenome {
	return {
		type: rng() < 0.5 ? left.type : right.type,
		clipMin: crossoverFn(left.clipMin, right.clipMin),
		clipMax: crossoverFn(left.clipMax, right.clipMax),
		noiseStd: crossoverFn(left.noiseStd, right.noiseStd),
		noiseDecay: crossoverFn(left.noiseDecay, right.noiseDecay),
	};
}

function crossoverReplayBuffer(
	left: ReplayBufferGenome,
	right: ReplayBufferGenome,
	crossoverFn: (valueA: number, valueB: number) => number,
	rng: () => number
): ReplayBufferGenome {
	return {
		bufferSize: Math.round(crossoverFn(left.bufferSize, right.bufferSize)),
		prioritized: rng() < 0.5 ? left.prioritized : right.prioritized,
		alphaPER: crossoverFn(left.alphaPER, right.alphaPER),
		betaPER: crossoverFn(left.betaPER, right.betaPER),
		betaAnneal: rng() < 0.5 ? left.betaAnneal : right.betaAnneal,
	};
}

function crossoverRL(
	left: RLGenome,
	right: RLGenome,
	co: CrossoverGenome,
	rng: () => number
): RLGenome {
	const crossoverFn = (valueA: number, valueB: number) =>
		crossoverScalar(valueA, valueB, co, rng);

	return {
		gamma: crossoverFn(left.gamma, right.gamma),
		learningRate: crossoverFn(left.learningRate, right.learningRate),
		rewardShaping: crossoverRewardShaping(
			left.rewardShaping,
			right.rewardShaping,
			crossoverFn,
			rng
		),
		horizon: crossoverHorizon(left.horizon, right.horizon, crossoverFn),
		discretePolicy: crossoverDiscretePolicy(
			left.discretePolicy,
			right.discretePolicy,
			crossoverFn,
			rng
		),
		continuousPolicy: crossoverContinuousPolicy(
			left.continuousPolicy,
			right.continuousPolicy,
			crossoverFn,
			rng
		),
		replayBuffer: crossoverReplayBuffer(
			left.replayBuffer,
			right.replayBuffer,
			crossoverFn,
			rng
		),
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
		network: crossoverNetwork(parentA.network, parentB.network, co, rng),
		rl: crossoverRL(parentA.rl, parentB.rl, co, rng),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
