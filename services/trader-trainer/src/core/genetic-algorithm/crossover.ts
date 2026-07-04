// ================================================================
//                        crossover operators
// ================================================================

import type {
	CrossoverGenome,
	LamarckGenome,
	LayerGenome,
	MutationGenome,
	NetworkGenome,
	RLGenome,
} from "./genome-types";

// ----------------------------------------------------------------
// Scalar crossover primitives
// ----------------------------------------------------------------

function lerpNum(first: number, second: number, blend: number): number {
	return first + (second - first) * blend;
}

/** Crossover two scalar values using the given strategy and return the offspring. */
export function crossoverScalar(
	left: number,
	right: number,
	co: CrossoverGenome,
	rng: () => number
): number {
	switch (co.type) {
		case "arithmetic":
			return lerpNum(left, right, co.blendAlpha);

		case "blend": {
			const lo = Math.min(left, right);
			const hi = Math.max(left, right);
			const diff = hi - lo;
			return (
				lo - co.blendAlpha * diff + rng() * (diff + 2 * co.blendAlpha * diff)
			);
		}

		case "sbx": {
			const randomValue = rng();
			const beta =
				randomValue < 0.5
					? (2 * randomValue) ** (1 / (co.sbxEta + 1))
					: (1 / (2 * (1 - randomValue))) ** (1 / (co.sbxEta + 1));
			return 0.5 * ((1 + beta) * left + (1 - beta) * right);
		}
		default:
			return rng() < 0.5 ? left : right;
	}
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
			// Extra layer from the longer parent — inherit with 50 % chance
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

		rewardShaping: {
			clip: rng() < 0.5 ? left.rewardShaping.clip : right.rewardShaping.clip,
			clipMin: crossoverFn(
				left.rewardShaping.clipMin,
				right.rewardShaping.clipMin
			),
			clipMax: crossoverFn(
				left.rewardShaping.clipMax,
				right.rewardShaping.clipMax
			),
			scale: rng() < 0.5 ? left.rewardShaping.scale : right.rewardShaping.scale,
			scaleFactor: crossoverFn(
				left.rewardShaping.scaleFactor,
				right.rewardShaping.scaleFactor
			),
			normalize:
				rng() < 0.5
					? left.rewardShaping.normalize
					: right.rewardShaping.normalize,
			sparse:
				rng() < 0.5 ? left.rewardShaping.sparse : right.rewardShaping.sparse,
		},

		horizon: {
			maxEpisodeLength: Math.round(
				crossoverFn(
					left.horizon.maxEpisodeLength,
					right.horizon.maxEpisodeLength
				)
			),
			nStepReturn: Math.round(
				crossoverFn(left.horizon.nStepReturn, right.horizon.nStepReturn)
			),
			frameSkip: Math.round(
				crossoverFn(left.horizon.frameSkip, right.horizon.frameSkip)
			),
		},

		discretePolicy: {
			type: rng() < 0.5 ? left.discretePolicy.type : right.discretePolicy.type,
			epsilonStart: crossoverFn(
				left.discretePolicy.epsilonStart,
				right.discretePolicy.epsilonStart
			),
			epsilonMin: crossoverFn(
				left.discretePolicy.epsilonMin,
				right.discretePolicy.epsilonMin
			),
			epsilonDecay: crossoverFn(
				left.discretePolicy.epsilonDecay,
				right.discretePolicy.epsilonDecay
			),
			temperature: crossoverFn(
				left.discretePolicy.temperature,
				right.discretePolicy.temperature
			),
		},

		continuousPolicy: {
			type:
				rng() < 0.5 ? left.continuousPolicy.type : right.continuousPolicy.type,
			clipMin: crossoverFn(
				left.continuousPolicy.clipMin,
				right.continuousPolicy.clipMin
			),
			clipMax: crossoverFn(
				left.continuousPolicy.clipMax,
				right.continuousPolicy.clipMax
			),
			noiseStd: crossoverFn(
				left.continuousPolicy.noiseStd,
				right.continuousPolicy.noiseStd
			),
			noiseDecay: crossoverFn(
				left.continuousPolicy.noiseDecay,
				right.continuousPolicy.noiseDecay
			),
		},

		replayBuffer: {
			bufferSize: Math.round(
				crossoverFn(left.replayBuffer.bufferSize, right.replayBuffer.bufferSize)
			),
			prioritized:
				rng() < 0.5
					? left.replayBuffer.prioritized
					: right.replayBuffer.prioritized,
			alphaPER: crossoverFn(
				left.replayBuffer.alphaPER,
				right.replayBuffer.alphaPER
			),
			betaPER: crossoverFn(
				left.replayBuffer.betaPER,
				right.replayBuffer.betaPER
			),
			betaAnneal:
				rng() < 0.5
					? left.replayBuffer.betaAnneal
					: right.replayBuffer.betaAnneal,
		},
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
		return { ...parentA }; // skip crossover
	}

	return {
		...parentA,
		network: crossoverNetwork(parentA.network, parentB.network, co, rng),
		rl: crossoverRL(parentA.rl, parentB.rl, co, rng),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
