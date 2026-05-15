// ================================================================
//                  genome mutation operators
// ================================================================

import type {
  Genome,
  NetworkGenome,
  RLGenome,
  MutationGenome,
  LayerGenome,
  ActivationType,
  ConnectionType,
  InitialisationType,
  NormalisationType,
} from "./genome_types";
import { sampleNoise, sampleGaussian } from "./noise";
import { clamp } from "./utils";

// ----------------------------------------------------------------
// Enum pools
// ----------------------------------------------------------------

const NORM_TYPES: NormalisationType[] = [
  "none", "logarithmic-normalization", "decimal-scaling",
  "border", "min-max", "robust-scaling", "z-score",
];
const ACTIVATIONS: ActivationType[] = [
  "ReLu", "sigmoid", "tanh", "leakyReLu", "ELU", "mish", "GELU", "softmax",
];
const CONNECTION_TYPES: ConnectionType[] = [
  "dense-skip", "fully-connected", "residual-connection",
];
const BIAS_TYPES: InitialisationType[] = [
  "zeros", "random", "xavier", "he", "leCun",
];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ----------------------------------------------------------------
// Sigma adaptation strategies
// ----------------------------------------------------------------

export function adaptSigma(m: MutationGenome, rng: () => number): number {
  switch (m.adaptation) {
    case "fixed":
      return m.sigma;
    case "sigma_adaptive":
      return m.sigma * (0.9 + 0.2 * rng());
    case "self_adaptive": {
      // Log-normal perturbation of selfSigma (1/5-rule inspired)
      const tau = 1 / Math.sqrt(2 * Math.max(1, m.sigma));
      return m.selfSigma * Math.exp(tau * sampleGaussian(rng, 1));
    }
    case "cma":
      return m.sigma; // Step-size control is external (CMA-ES loop)
    default:
      return m.sigma;
  }
}

// ----------------------------------------------------------------
// Layer mutation
// ----------------------------------------------------------------

export function mutateLayer(
  layer: LayerGenome,
  m: MutationGenome,
  rng: () => number,
): LayerGenome {
  const sigma = adaptSigma(m, rng);
  const clone = { ...layer };

  if (rng() < m.rate) {
    const delta = Math.round(sampleNoise(m.distribution, sigma * 10, rng));
    clone.neurons = Math.max(1, clone.neurons + delta);
  }
  if (m.mutateActivations && rng() < m.activationMutationRate) {
    clone.activation = pick(ACTIVATIONS, rng);
  }
  if (rng() < m.rate * 0.3) {
    clone.connectionType = pick(CONNECTION_TYPES, rng);
  }
  if (rng() < m.rate * 0.2) {
    clone.biasType = pick(BIAS_TYPES, rng);
  }
  return clone;
}

// ----------------------------------------------------------------
// RL hyperparameter mutation
// ----------------------------------------------------------------

function mutateRL(
  rl: RLGenome,
  m: MutationGenome,
  sigma: number,
  rng: () => number,
): RLGenome {
  const perturb = (v: number, s = sigma) =>
    v + sampleNoise(m.distribution, s, rng);

  return {
    gamma:        clamp(perturb(rl.gamma, 0.01), 0.8, 0.9999),
    learningRate: clamp(
      rl.learningRate * Math.exp(sampleGaussian(rng, 0.3)),
      1e-6, 1e-1,
    ),

    rewardShaping: {
      ...rl.rewardShaping,
      clipMin:     perturb(rl.rewardShaping.clipMin, 0.1),
      clipMax:     perturb(rl.rewardShaping.clipMax, 0.1),
      scaleFactor: Math.max(0.01, perturb(rl.rewardShaping.scaleFactor, 0.1)),
    },

    horizon: {
      maxEpisodeLength: Math.max(
        10,
        Math.round(rl.horizon.maxEpisodeLength + sampleNoise(m.distribution, 20, rng)),
      ),
      nStepReturn: Math.max(
        1,
        Math.round(rl.horizon.nStepReturn + (rng() < 0.1 ? (rng() < 0.5 ? 1 : -1) : 0)),
      ),
      frameSkip: Math.max(
        1,
        Math.round(rl.horizon.frameSkip + (rng() < 0.1 ? (rng() < 0.5 ? 1 : -1) : 0)),
      ),
    },

    discretePolicy: {
      ...rl.discretePolicy,
      epsilonStart: clamp(perturb(rl.discretePolicy.epsilonStart, 0.05), 0.1, 1.0),
      epsilonMin:   clamp(perturb(rl.discretePolicy.epsilonMin,   0.01), 0.001, 0.2),
      epsilonDecay: clamp(perturb(rl.discretePolicy.epsilonDecay, 0.002), 0.9, 0.9999),
      temperature:  Math.max(0.01, perturb(rl.discretePolicy.temperature, 0.1)),
    },

    continuousPolicy: {
      ...rl.continuousPolicy,
      noiseStd:   Math.max(0.001, perturb(rl.continuousPolicy.noiseStd, 0.02)),
      noiseDecay: clamp(perturb(rl.continuousPolicy.noiseDecay, 0.001), 0.9, 0.9999),
    },

    replayBuffer: {
      ...rl.replayBuffer,
      bufferSize: Math.max(
        500,
        Math.round(rl.replayBuffer.bufferSize * (0.8 + rng() * 0.4)),
      ),
      alphaPER: clamp(perturb(rl.replayBuffer.alphaPER, 0.05), 0, 1),
      betaPER:  clamp(perturb(rl.replayBuffer.betaPER,  0.05), 0, 1),
    },
  };
}

// ----------------------------------------------------------------
// Full genome mutation
// ----------------------------------------------------------------

export function mutateGenome(g: Genome, rng: () => number): Genome {
  const m = g.mutation;
  const sigma = adaptSigma(m, rng);

  // ---- Network structure ----
  const perLayerMode = m.scope === "per_layer";
  let layers: LayerGenome[] = g.network.hiddenLayers.map(l =>
    perLayerMode || rng() < m.rate ? mutateLayer(l, m, rng) : { ...l },
  );

  // Neuron-level structural ops
  if (layers.length > 0 && rng() < m.addNeuronRate) {
    const li = Math.floor(rng() * layers.length);
    layers[li] = { ...layers[li], neurons: layers[li].neurons + 1 };
  }
  if (layers.length > 0 && rng() < m.removeNeuronRate) {
    const li = Math.floor(rng() * layers.length);
    layers[li] = { ...layers[li], neurons: Math.max(1, layers[li].neurons - 1) };
  }

  // Layer-level structural ops
  if (rng() < m.addLayerRate) {
    const newLayer: LayerGenome = {
      neurons:        16 + Math.floor(rng() * 32),
      activation:     pick(ACTIVATIONS, rng),
      connectionType: "dense-skip",
      biasType:       "zeros",
    };
    layers.splice(Math.floor(rng() * (layers.length + 1)), 0, newLayer);
  }
  if (layers.length > 1 && rng() < m.removeLayerRate) {
    layers.splice(Math.floor(rng() * layers.length), 1);
  }

  const network: NetworkGenome = {
    ...g.network,
    hiddenLayers: layers,
    normalization:
      rng() < m.rate * 0.2 ? pick(NORM_TYPES, rng) : g.network.normalization,
  };

  // ---- RL hyperparameters ----
  const rl: RLGenome = m.mutateHyperparams
    ? mutateRL(g.rl, m, sigma, rng)
    : { ...g.rl };

  // ---- Self-adaptive mutation parameters ----
  const mutation: MutationGenome = {
    ...m,
    sigma:     Math.max(1e-5, m.sigma + sampleNoise(m.distribution, sigma * 0.1, rng)),
    selfSigma: Math.max(1e-5, m.selfSigma + sampleNoise("gaussian", sigma * 0.05, rng)),
    rate:      clamp(m.rate + sampleGaussian(rng, 0.01), 0.001, 0.5),
  };

  return { ...g, network, rl, mutation };
}