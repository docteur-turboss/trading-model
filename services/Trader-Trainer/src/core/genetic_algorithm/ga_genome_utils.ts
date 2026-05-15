// ================================================================
//   ga_genome_utils.ts — Genome factory, mutation & crossover
// ================================================================

import {
  Genome, NetworkGenome, RLGenome, MutationGenome, CrossoverGenome,
  GAControlGenome, LayerGenome, RewardShapingGenome, HorizonGenome,
  DiscretePolicyGenome, ContinuousPolicyGenome, ReplayBufferGenome,
  MutationDistribution,
  CrossoverType, SelectionType, FitnessType,
  ActivationType, ConnectionType, InitialisationType, NormalisationType,
} from "./genome_types";

// ----------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic per seed
// ----------------------------------------------------------------
export function makePRNG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------
// Default genome factory
// ----------------------------------------------------------------
export function createDefaultGenome(id: string, generation = 0, rng: () => number = Math.random): Genome {
  const network: NetworkGenome = {
    inputDim: 16,
    outputDim: 3,
    hiddenLayers: [
      { neurons: 64, activation: "relu",    connectionType: "dense", biasType: "zeros" },
      { neurons: 32, activation: "relu",    connectionType: "dense", biasType: "zeros" },
    ],
    normalization: "none",
  };

  const rewardShaping: RewardShapingGenome = {
    clip: false, clipMin: -1, clipMax: 1,
    scale: false, scaleFactor: 1,
    normalize: false,
    sparse: false,
  };

  const horizon: HorizonGenome = {
    maxEpisodeLength: 500,
    nStepReturn: 1,
    frameSkip: 1,
  };

  const discretePolicy: DiscretePolicyGenome = {
    type: "epsilon_greedy",
    epsilonStart: 1.0, epsilonMin: 0.05, epsilonDecay: 0.995,
    temperature: 1.0,
  };

  const continuousPolicy: ContinuousPolicyGenome = {
    type: "tanh_squashing",
    clipMin: -1, clipMax: 1,
    noiseStd: 0.1, noiseDecay: 0.999,
  };

  const replayBuffer: ReplayBufferGenome = {
    bufferSize: 10_000,
    prioritized: false,
    alphaPER: 0.6, betaPER: 0.4,
    betaAnneal: true,
  };

  const rl: RLGenome = {
    gamma: 0.99,
    learningRate: 1e-3,
    rewardShaping, horizon,
    discretePolicy, continuousPolicy, replayBuffer,
  };

  const mutation: MutationGenome = {
    rate: 0.1, sigma: 0.05, noiseStd: 0.02,
    distribution: "gaussian",
    adaptation: "fixed",
    scope: "global",
    selfSigma: 0.05,
    mutateActivations: false,
    activationMutationRate: 0.05,
    mutateHyperparams: true,
    addNeuronRate: 0.01, removeNeuronRate: 0.01,
    addLayerRate: 0.005, removeLayerRate: 0.005,
    addConnectionRate: 0.01, removeConnectionRate: 0.01,
  };

  const crossover: CrossoverGenome = {
    type: "uniform",
    probability: 0.7,
    blendAlpha: 0.5,
    sbxEta: 2,
  };

  const gaControl: GAControlGenome = {
    populationSize: 20,
    elitismFraction: 0.1,
    survivorFraction: 0.5,
    selectionType: "tournament",
    fitnessType: "total_pnl",
    episodesPerIndividual: 3,
    seedsPerEval: 2,
    rewardThreshold: Infinity,
    stagnationPatience: 15,
    maxGenerations: 100,
    timeBudgetMs: 5 * 60 * 1000,
    envSeed: 42,
    mutationSeed: 1337,
    networkSeed: 7,
  };

  return { id, generation, network, rl, mutation, crossover, gaControl };
}

// ----------------------------------------------------------------
// Noise samplers
// ----------------------------------------------------------------
function sampleGaussian(rng: () => number, sigma: number): number {
  // Box-Muller
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

function sampleCauchy(rng: () => number, sigma: number): number {
  return sigma * Math.tan(Math.PI * (rng() - 0.5));
}

function sampleUniform(rng: () => number, sigma: number): number {
  return (rng() * 2 - 1) * sigma;
}

function sampleLevy(rng: () => number, sigma: number): number {
  // Lévy via Chambers–Mallows–Stuck with α=0.5
  const u = Math.PI * (rng() - 0.5);
  const w = -Math.log(Math.max(1e-10, rng()));
  return sigma * Math.sin(0.5 * u) / Math.pow(Math.cos(u), 2) * Math.pow(Math.cos(0.5 * u) / w, 1);
}

export function sampleNoise(dist: MutationDistribution, sigma: number, rng: () => number): number {
  switch (dist) {
    case "gaussian": return sampleGaussian(rng, sigma);
    case "cauchy":   return sampleCauchy(rng, sigma);
    case "uniform":  return sampleUniform(rng, sigma);
    case "levy":     return sampleLevy(rng, sigma);
  }
}

// ----------------------------------------------------------------
// Sigma adaptation
// ----------------------------------------------------------------
function adaptSigma(m: MutationGenome, rng: () => number): number {
  switch (m.adaptation) {
    case "fixed":         return m.sigma;
    case "sigma_adaptive": return m.sigma * (0.9 + 0.2 * rng()); // random rescale
    case "self_adaptive": {
      // 1/5-rule-inspired: evolve selfSigma by log-normal perturbation
      const tau = 1 / Math.sqrt(2 * Math.max(1, m.sigma));
      return m.selfSigma * Math.exp(tau * sampleGaussian(rng, 1));
    }
    case "cma": return m.sigma; // CMA handled externally (step-size control)
    default:    return m.sigma;
  }
}

// ----------------------------------------------------------------
// Structural mutations
// ----------------------------------------------------------------
const ACTIVATIONS: ActivationType[]    = ["relu", "sigmoid", "tanh", "leaky_relu", "elu", "swish", "linear"];
const CONNECTION_TYPES: ConnectionType[] = ["dense", "sparse", "residual"];
const BIAS_TYPES: InitialisationType[]  = ["zeros", "random", "xavier"];
const NORM_TYPES: NormalisationType[]   = ["none", "batch", "layer"];

function mutateLayer(layer: LayerGenome, m: MutationGenome, rng: () => number): LayerGenome {
  const sigma = adaptSigma(m, rng);
  const clone = { ...layer };

  if (rng() < m.rate) {
    const delta = Math.round(sampleNoise(m.distribution, sigma * 10, rng));
    clone.neurons = Math.max(1, clone.neurons + delta);
  }
  if (m.mutateActivations && rng() < m.activationMutationRate) {
    clone.activation = ACTIVATIONS[Math.floor(rng() * ACTIVATIONS.length)];
  }
  if (rng() < m.rate * 0.3) {
    clone.connectionType = CONNECTION_TYPES[Math.floor(rng() * CONNECTION_TYPES.length)];
  }
  if (rng() < m.rate * 0.2) {
    clone.biasType = BIAS_TYPES[Math.floor(rng() * BIAS_TYPES.length)];
  }
  return clone;
}

// ----------------------------------------------------------------
// Full genome mutation
// ----------------------------------------------------------------
export function mutateGenome(g: Genome, rng: () => number): Genome {
  const m = g.mutation;
  const sigma = adaptSigma(m, rng);

  // ---- Network structure ----
  const hiddenLayers = g.network.hiddenLayers.map(l =>
    m.scope === "per_layer" ? mutateLayer(l, m, rng) :
    rng() < m.rate ? mutateLayer(l, m, rng) : { ...l }
  );

  // Structural: add / remove neuron in random layer
  if (hiddenLayers.length > 0 && rng() < m.addNeuronRate) {
    const li = Math.floor(rng() * hiddenLayers.length);
    hiddenLayers[li] = { ...hiddenLayers[li], neurons: hiddenLayers[li].neurons + 1 };
  }
  if (hiddenLayers.length > 0 && rng() < m.removeNeuronRate) {
    const li = Math.floor(rng() * hiddenLayers.length);
    hiddenLayers[li] = { ...hiddenLayers[li], neurons: Math.max(1, hiddenLayers[li].neurons - 1) };
  }

  // Add / remove layer
  let layers = [...hiddenLayers];
  if (rng() < m.addLayerRate) {
    const newLayer: LayerGenome = {
      neurons: 16 + Math.floor(rng() * 32),
      activation: ACTIVATIONS[Math.floor(rng() * ACTIVATIONS.length)],
      connectionType: "dense",
      biasType: "zeros",
    };
    layers.splice(Math.floor(rng() * (layers.length + 1)), 0, newLayer);
  }
  if (layers.length > 1 && rng() < m.removeLayerRate) {
    layers.splice(Math.floor(rng() * layers.length), 1);
  }

  const network: NetworkGenome = {
    ...g.network,
    hiddenLayers: layers,
    normalization: rng() < m.rate * 0.2
      ? NORM_TYPES[Math.floor(rng() * NORM_TYPES.length)]
      : g.network.normalization,
  };

  // ---- RL hyperparameters ----
  const rl: RLGenome = m.mutateHyperparams ? mutateRL(g.rl, m, sigma, rng) : { ...g.rl };

  // ---- Mutation genome self-adaptation ----
  const mutation: MutationGenome = {
    ...m,
    sigma: Math.max(1e-5, m.sigma + sampleNoise(m.distribution, sigma * 0.1, rng)),
    selfSigma: Math.max(1e-5, m.selfSigma + sampleNoise("gaussian", sigma * 0.05, rng)),
    rate: clamp(m.rate + sampleGaussian(rng, 0.01), 0.001, 0.5),
  };

  return { ...g, network, rl, mutation };
}

function mutateRL(rl: RLGenome, m: MutationGenome, sigma: number, rng: () => number): RLGenome {
  const perturb = (v: number, s = sigma) => v + sampleNoise(m.distribution, s, rng);

  return {
    gamma:        clamp(perturb(rl.gamma, 0.01), 0.8, 0.9999),
    learningRate: clamp(rl.learningRate * Math.exp(sampleGaussian(rng, 0.3)), 1e-6, 1e-1),
    rewardShaping: {
      ...rl.rewardShaping,
      clipMin:     perturb(rl.rewardShaping.clipMin, 0.1),
      clipMax:     perturb(rl.rewardShaping.clipMax, 0.1),
      scaleFactor: Math.max(0.01, perturb(rl.rewardShaping.scaleFactor, 0.1)),
    },
    horizon: {
      maxEpisodeLength: Math.max(10, Math.round(rl.horizon.maxEpisodeLength + sampleNoise(m.distribution, 20, rng))),
      nStepReturn:      Math.max(1,  Math.round(rl.horizon.nStepReturn + (rng() < 0.1 ? (rng() < 0.5 ? 1 : -1) : 0))),
      frameSkip:        Math.max(1,  Math.round(rl.horizon.frameSkip   + (rng() < 0.1 ? (rng() < 0.5 ? 1 : -1) : 0))),
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
      bufferSize: Math.max(500, Math.round(rl.replayBuffer.bufferSize * (0.8 + rng() * 0.4))),
      alphaPER:   clamp(perturb(rl.replayBuffer.alphaPER, 0.05), 0, 1),
      betaPER:    clamp(perturb(rl.replayBuffer.betaPER,  0.05), 0, 1),
    },
  };
}

// ----------------------------------------------------------------
// Crossover operators
// ----------------------------------------------------------------
export function crossoverGenomes(parentA: Genome, parentB: Genome, rng: () => number): Genome {
  const co = parentA.crossover;
  if (rng() > co.probability) return { ...parentA }; // no crossover

  const network  = crossoverNetwork(parentA.network, parentB.network, co, rng);
  const rl       = crossoverRL(parentA.rl, parentB.rl, co, rng);
  const mutation = crossoverMutation(parentA.mutation, parentB.mutation, rng);

  return { ...parentA, network, rl, mutation };
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function crossoverScalar(a: number, b: number, type: CrossoverType, alpha: number, eta: number, rng: () => number): number {
  switch (type) {
    case "arithmetic": return lerpNum(a, b, alpha);
    case "blend": {
      const lo = Math.min(a, b), hi = Math.max(a, b), d = hi - lo;
      return lo - alpha * d + rng() * (d + 2 * alpha * d);
    }
    case "sbx": {
      // Simulated Binary Crossover
      const u = rng();
      const beta = u < 0.5
        ? Math.pow(2 * u, 1 / (eta + 1))
        : Math.pow(1 / (2 * (1 - u)), 1 / (eta + 1));
      return 0.5 * ((1 + beta) * a + (1 - beta) * b);
    }
    default: return rng() < 0.5 ? a : b; // uniform / one-point fallback
  }
}

function crossoverNetwork(a: NetworkGenome, b: NetworkGenome, co: CrossoverGenome, rng: () => number): NetworkGenome {
  const minLen = Math.min(a.hiddenLayers.length, b.hiddenLayers.length);
  const maxLen = Math.max(a.hiddenLayers.length, b.hiddenLayers.length);
  const longer = a.hiddenLayers.length >= b.hiddenLayers.length ? a.hiddenLayers : b.hiddenLayers;

  const hiddenLayers: LayerGenome[] = [];
  for (let i = 0; i < maxLen; i++) {
    if (i >= minLen) {
      if (rng() < 0.5) hiddenLayers.push({ ...longer[i] });
    } else {
      const la = a.hiddenLayers[i], lb = b.hiddenLayers[i];
      hiddenLayers.push({
        neurons: Math.round(crossoverScalar(la.neurons, lb.neurons, co.type, co.blendAlpha, co.sbxEta, rng)),
        activation:     rng() < 0.5 ? la.activation     : lb.activation,
        connectionType: rng() < 0.5 ? la.connectionType : lb.connectionType,
        biasType:       rng() < 0.5 ? la.biasType        : lb.biasType,
      });
    }
  }

  return { ...a, hiddenLayers, normalization: rng() < 0.5 ? a.normalization : b.normalization };
}

function crossoverRL(a: RLGenome, b: RLGenome, co: CrossoverGenome, rng: () => number): RLGenome {
  const x = (va: number, vb: number) => crossoverScalar(va, vb, co.type, co.blendAlpha, co.sbxEta, rng);
  return {
    gamma:        x(a.gamma, b.gamma),
    learningRate: x(a.learningRate, b.learningRate),
    rewardShaping: {
      clip:        rng() < 0.5 ? a.rewardShaping.clip : b.rewardShaping.clip,
      clipMin:     x(a.rewardShaping.clipMin,     b.rewardShaping.clipMin),
      clipMax:     x(a.rewardShaping.clipMax,     b.rewardShaping.clipMax),
      scale:       rng() < 0.5 ? a.rewardShaping.scale : b.rewardShaping.scale,
      scaleFactor: x(a.rewardShaping.scaleFactor, b.rewardShaping.scaleFactor),
      normalize:   rng() < 0.5 ? a.rewardShaping.normalize : b.rewardShaping.normalize,
      sparse:      rng() < 0.5 ? a.rewardShaping.sparse    : b.rewardShaping.sparse,
    },
    horizon: {
      maxEpisodeLength: Math.round(x(a.horizon.maxEpisodeLength, b.horizon.maxEpisodeLength)),
      nStepReturn:      Math.round(x(a.horizon.nStepReturn,      b.horizon.nStepReturn)),
      frameSkip:        Math.round(x(a.horizon.frameSkip,        b.horizon.frameSkip)),
    },
    discretePolicy: {
      type:         rng() < 0.5 ? a.discretePolicy.type : b.discretePolicy.type,
      epsilonStart: x(a.discretePolicy.epsilonStart, b.discretePolicy.epsilonStart),
      epsilonMin:   x(a.discretePolicy.epsilonMin,   b.discretePolicy.epsilonMin),
      epsilonDecay: x(a.discretePolicy.epsilonDecay, b.discretePolicy.epsilonDecay),
      temperature:  x(a.discretePolicy.temperature,  b.discretePolicy.temperature),
    },
    continuousPolicy: {
      type:       rng() < 0.5 ? a.continuousPolicy.type : b.continuousPolicy.type,
      clipMin:    x(a.continuousPolicy.clipMin,   b.continuousPolicy.clipMin),
      clipMax:    x(a.continuousPolicy.clipMax,   b.continuousPolicy.clipMax),
      noiseStd:   x(a.continuousPolicy.noiseStd,  b.continuousPolicy.noiseStd),
      noiseDecay: x(a.continuousPolicy.noiseDecay,b.continuousPolicy.noiseDecay),
    },
    replayBuffer: {
      bufferSize:  Math.round(x(a.replayBuffer.bufferSize, b.replayBuffer.bufferSize)),
      prioritized: rng() < 0.5 ? a.replayBuffer.prioritized : b.replayBuffer.prioritized,
      alphaPER:    x(a.replayBuffer.alphaPER, b.replayBuffer.alphaPER),
      betaPER:     x(a.replayBuffer.betaPER,  b.replayBuffer.betaPER),
      betaAnneal:  rng() < 0.5 ? a.replayBuffer.betaAnneal : b.replayBuffer.betaAnneal,
    },
  };
}

function crossoverMutation(a: MutationGenome, b: MutationGenome, rng: () => number): MutationGenome {
  return {
    rate:        rng() < 0.5 ? a.rate    : b.rate,
    sigma:       rng() < 0.5 ? a.sigma   : b.sigma,
    noiseStd:    rng() < 0.5 ? a.noiseStd: b.noiseStd,
    distribution:rng() < 0.5 ? a.distribution : b.distribution,
    adaptation:  rng() < 0.5 ? a.adaptation   : b.adaptation,
    scope:       rng() < 0.5 ? a.scope        : b.scope,
    selfSigma:   rng() < 0.5 ? a.selfSigma    : b.selfSigma,
    mutateActivations:     rng() < 0.5 ? a.mutateActivations     : b.mutateActivations,
    activationMutationRate:rng() < 0.5 ? a.activationMutationRate: b.activationMutationRate,
    mutateHyperparams:     rng() < 0.5 ? a.mutateHyperparams     : b.mutateHyperparams,
    addNeuronRate:        rng() < 0.5 ? a.addNeuronRate    : b.addNeuronRate,
    removeNeuronRate:     rng() < 0.5 ? a.removeNeuronRate : b.removeNeuronRate,
    addLayerRate:         rng() < 0.5 ? a.addLayerRate     : b.addLayerRate,
    removeLayerRate:      rng() < 0.5 ? a.removeLayerRate  : b.removeLayerRate,
    addConnectionRate:    rng() < 0.5 ? a.addConnectionRate    : b.addConnectionRate,
    removeConnectionRate: rng() < 0.5 ? a.removeConnectionRate : b.removeConnectionRate,
  };
}

// ----------------------------------------------------------------
// Selection operators
// ----------------------------------------------------------------
export function selectParent(
  population: Genome[],
  type: SelectionType,
  rng: () => number,
  tournamentK = 3,
): Genome {
  switch (type) {
    case "tournament": {
      let best = population[Math.floor(rng() * population.length)];
      for (let i = 1; i < tournamentK; i++) {
        const challenger = population[Math.floor(rng() * population.length)];
        if ((challenger.fitness ?? -Infinity) > (best.fitness ?? -Infinity)) best = challenger;
      }
      return best;
    }
    case "roulette": {
      const fitnesses = population.map(g => Math.max(0, g.fitness ?? 0));
      const total = fitnesses.reduce((s, v) => s + v, 0) || 1;
      let pick = rng() * total;
      for (let i = 0; i < population.length; i++) {
        pick -= fitnesses[i];
        if (pick <= 0) return population[i];
      }
      return population[population.length - 1];
    }
    case "rank": {
      const sorted = [...population].sort((a, b) => (a.fitness ?? 0) - (b.fitness ?? 0));
      const ranks = sorted.map((_, i) => i + 1);
      const total = ranks.reduce((s, v) => s + v, 0);
      let pick = rng() * total;
      for (let i = 0; i < sorted.length; i++) {
        pick -= ranks[i];
        if (pick <= 0) return sorted[i];
      }
      return sorted[sorted.length - 1];
    }
    case "truncation":
    case "sus":
    default:
      return population[Math.floor(rng() * population.length)];
  }
}

// ----------------------------------------------------------------
// Fitness computation
// ----------------------------------------------------------------
export function computeFitness(type: FitnessType, scores: number[]): number {
  if (scores.length === 0) return -Infinity;
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;

  switch (type) {
    case "total_pnl": return mean;
    case "sharpe": {
      const std = Math.sqrt(scores.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / Math.max(1, scores.length - 1));
      return std < 1e-10 ? mean : mean / std;
    }
    case "sortino": {
      const negReturns = scores.filter(v => v < 0);
      const downDev = negReturns.length === 0 ? 1e-10
        : Math.sqrt(negReturns.map(v => v ** 2).reduce((s, v) => s + v, 0) / negReturns.length);
      return mean / downDev;
    }
    case "calmar": {
      let maxDD = 0, peak = -Infinity, running = 0;
      for (const r of scores) {
        running += r;
        if (running > peak) peak = running;
        const dd = peak - running;
        if (dd > maxDD) maxDD = dd;
      }
      return maxDD < 1e-10 ? mean : mean / maxDD;
    }
    case "composite": {
      const sharpe  = computeFitness("sharpe",  scores);
      const sortino = computeFitness("sortino", scores);
      return 0.4 * mean + 0.3 * sharpe + 0.3 * sortino;
    }
    default: return mean;
  }
}

// ----------------------------------------------------------------
// Reward shaping
// ----------------------------------------------------------------
export function shapeReward(raw: number, cfg: RewardShapingGenome): number {
  let r = raw;
  if (cfg.scale)     r *= cfg.scaleFactor;
  if (cfg.clip)      r = clamp(r, cfg.clipMin, cfg.clipMax);
  // normalize handled externally via running stats (Z-score)
  return r;
}

// ----------------------------------------------------------------
// Utility
// ----------------------------------------------------------------
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}