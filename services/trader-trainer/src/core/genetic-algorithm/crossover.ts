// ================================================================
//                        crossover operators
// ================================================================

import type {
  NetworkGenome,
  RLGenome,
  MutationGenome,
  CrossoverGenome,
  LayerGenome,
  CrossoverType,
  LamarckGenome,
} from './genome-types';

// ----------------------------------------------------------------
// Scalar crossover primitives
// ----------------------------------------------------------------

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Crossover two scalar values using the given strategy and return the offspring. */
export function crossoverScalar(
  a: number,
  b: number,
  type: CrossoverType,
  alpha: number,
  eta: number,
  rng: () => number
): number {
  switch (type) {
    case 'arithmetic':
      return lerpNum(a, b, alpha);

    case 'blend': {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const d = hi - lo;
      return lo - alpha * d + rng() * (d + 2 * alpha * d);
    }

    case 'sbx': {
      // Simulated Binary Crossover
      const u = rng();
      const beta =
        u < 0.5 ? Math.pow(2 * u, 1 / (eta + 1)) : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));
      return 0.5 * ((1 + beta) * a + (1 - beta) * b);
    }

    case 'uniform':
    default:
      return rng() < 0.5 ? a : b;
  }
}

// ----------------------------------------------------------------
// Sub-genome crossover helpers
// ----------------------------------------------------------------

function crossoverNetwork(
  a: NetworkGenome,
  b: NetworkGenome,
  co: CrossoverGenome,
  rng: () => number
): NetworkGenome {
  const minLen = Math.min(a.hiddenLayers.length, b.hiddenLayers.length);
  const maxLen = Math.max(a.hiddenLayers.length, b.hiddenLayers.length);
  const longer = a.hiddenLayers.length >= b.hiddenLayers.length ? a.hiddenLayers : b.hiddenLayers;

  const x = (va: number, vb: number) =>
    crossoverScalar(va, vb, co.type, co.blendAlpha, co.sbxEta, rng);

  const hiddenLayers: LayerGenome[] = [];
  for (let i = 0; i < maxLen; i++) {
    if (i >= minLen) {
      // Extra layer from the longer parent — inherit with 50 % chance
      if (rng() < 0.5) hiddenLayers.push({ ...longer[i] });
    } else {
      const la = a.hiddenLayers[i];
      const lb = b.hiddenLayers[i];
      hiddenLayers.push({
        neurons: Math.round(x(la.neurons, lb.neurons)),
        activation: rng() < 0.5 ? la.activation : lb.activation,
        connectionType: rng() < 0.5 ? la.connectionType : lb.connectionType,
        biasType: rng() < 0.5 ? la.biasType : lb.biasType,
      });
    }
  }

  return {
    ...a,
    hiddenLayers,
    normalization: rng() < 0.5 ? a.normalization : b.normalization,
  };
}

function crossoverRL(a: RLGenome, b: RLGenome, co: CrossoverGenome, rng: () => number): RLGenome {
  const x = (va: number, vb: number) =>
    crossoverScalar(va, vb, co.type, co.blendAlpha, co.sbxEta, rng);

  return {
    gamma: x(a.gamma, b.gamma),
    learningRate: x(a.learningRate, b.learningRate),

    rewardShaping: {
      clip: rng() < 0.5 ? a.rewardShaping.clip : b.rewardShaping.clip,
      clipMin: x(a.rewardShaping.clipMin, b.rewardShaping.clipMin),
      clipMax: x(a.rewardShaping.clipMax, b.rewardShaping.clipMax),
      scale: rng() < 0.5 ? a.rewardShaping.scale : b.rewardShaping.scale,
      scaleFactor: x(a.rewardShaping.scaleFactor, b.rewardShaping.scaleFactor),
      normalize: rng() < 0.5 ? a.rewardShaping.normalize : b.rewardShaping.normalize,
      sparse: rng() < 0.5 ? a.rewardShaping.sparse : b.rewardShaping.sparse,
    },

    horizon: {
      maxEpisodeLength: Math.round(x(a.horizon.maxEpisodeLength, b.horizon.maxEpisodeLength)),
      nStepReturn: Math.round(x(a.horizon.nStepReturn, b.horizon.nStepReturn)),
      frameSkip: Math.round(x(a.horizon.frameSkip, b.horizon.frameSkip)),
    },

    discretePolicy: {
      type: rng() < 0.5 ? a.discretePolicy.type : b.discretePolicy.type,
      epsilonStart: x(a.discretePolicy.epsilonStart, b.discretePolicy.epsilonStart),
      epsilonMin: x(a.discretePolicy.epsilonMin, b.discretePolicy.epsilonMin),
      epsilonDecay: x(a.discretePolicy.epsilonDecay, b.discretePolicy.epsilonDecay),
      temperature: x(a.discretePolicy.temperature, b.discretePolicy.temperature),
    },

    continuousPolicy: {
      type: rng() < 0.5 ? a.continuousPolicy.type : b.continuousPolicy.type,
      clipMin: x(a.continuousPolicy.clipMin, b.continuousPolicy.clipMin),
      clipMax: x(a.continuousPolicy.clipMax, b.continuousPolicy.clipMax),
      noiseStd: x(a.continuousPolicy.noiseStd, b.continuousPolicy.noiseStd),
      noiseDecay: x(a.continuousPolicy.noiseDecay, b.continuousPolicy.noiseDecay),
    },

    replayBuffer: {
      bufferSize: Math.round(x(a.replayBuffer.bufferSize, b.replayBuffer.bufferSize)),
      prioritized: rng() < 0.5 ? a.replayBuffer.prioritized : b.replayBuffer.prioritized,
      alphaPER: x(a.replayBuffer.alphaPER, b.replayBuffer.alphaPER),
      betaPER: x(a.replayBuffer.betaPER, b.replayBuffer.betaPER),
      betaAnneal: rng() < 0.5 ? a.replayBuffer.betaAnneal : b.replayBuffer.betaAnneal,
    },
  };
}

function crossoverMutation(
  a: MutationGenome,
  b: MutationGenome,
  rng: () => number
): MutationGenome {
  const coin = <T>(va: T, vb: T): T => (rng() < 0.5 ? va : vb);
  return {
    rate: coin(a.rate, b.rate),
    sigma: coin(a.sigma, b.sigma),
    noiseStd: coin(a.noiseStd, b.noiseStd),
    distribution: coin(a.distribution, b.distribution),
    adaptation: coin(a.adaptation, b.adaptation),
    scope: coin(a.scope, b.scope),
    selfSigma: coin(a.selfSigma, b.selfSigma),
    mutateActivations: coin(a.mutateActivations, b.mutateActivations),
    activationMutationRate: coin(a.activationMutationRate, b.activationMutationRate),
    mutateHyperparams: coin(a.mutateHyperparams, b.mutateHyperparams),
    addNeuronRate: coin(a.addNeuronRate, b.addNeuronRate),
    removeNeuronRate: coin(a.removeNeuronRate, b.removeNeuronRate),
    addLayerRate: coin(a.addLayerRate, b.addLayerRate),
    removeLayerRate: coin(a.removeLayerRate, b.removeLayerRate),
    addConnectionRate: coin(a.addConnectionRate, b.addConnectionRate),
    removeConnectionRate: coin(a.removeConnectionRate, b.removeConnectionRate),
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
  if (rng() > co.probability) return { ...parentA }; // skip crossover

  return {
    ...parentA,
    network: crossoverNetwork(parentA.network, parentB.network, co, rng),
    rl: crossoverRL(parentA.rl, parentB.rl, co, rng),
    mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
  };
}
