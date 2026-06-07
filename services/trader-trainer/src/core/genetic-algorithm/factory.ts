// ================================================================
//                default genome construction
// ================================================================

import type {
  Genome,
  NetworkGenome,
  RLGenome,
  MutationGenome,
  CrossoverGenome,
  GAControlGenome,
  RewardShapingGenome,
  HorizonGenome,
  DiscretePolicyGenome,
  ContinuousPolicyGenome,
  ReplayBufferGenome,
} from './genome-types';

/** Create a genome with sensible default values for network, RL hyperparameters, mutation, crossover, and GA control. */
export function createDefaultGenome(
  id: string,
  generation = 0,
  _rng?: () => number // reserved for future stochastic factories
): Genome {
  const network: NetworkGenome = {
    inputDim: 32,
    outputDim: 3,
    hiddenLayers: [
      { neurons: 64, activation: 'ReLu', connectionType: 'dense-skip', biasType: 'zeros' },
      { neurons: 32, activation: 'ReLu', connectionType: 'dense-skip', biasType: 'zeros' },
    ],
    normalization: 'none',
  };

  const rewardShaping: RewardShapingGenome = {
    clip: false,
    clipMin: -1,
    clipMax: 1,
    scale: false,
    scaleFactor: 1,
    normalize: false,
    sparse: false,
  };

  const horizon: HorizonGenome = {
    maxEpisodeLength: 500,
    nStepReturn: 1,
    frameSkip: 1,
  };

  const discretePolicy: DiscretePolicyGenome = {
    type: 'epsilon_greedy',
    epsilonStart: 1.0,
    epsilonMin: 0.05,
    epsilonDecay: 0.995,
    temperature: 1.0,
  };

  const continuousPolicy: ContinuousPolicyGenome = {
    type: 'tanh_squashing',
    clipMin: -1,
    clipMax: 1,
    noiseStd: 0.1,
    noiseDecay: 0.999,
  };

  const replayBuffer: ReplayBufferGenome = {
    bufferSize: 10_000,
    prioritized: false,
    alphaPER: 0.6,
    betaPER: 0.4,
    betaAnneal: true,
  };

  const rl: RLGenome = {
    gamma: 0.99,
    learningRate: 1e-3,
    rewardShaping,
    horizon,
    discretePolicy,
    continuousPolicy,
    replayBuffer,
  };

  const mutation: MutationGenome = {
    rate: 0.1,
    sigma: 0.05,
    noiseStd: 0.02,
    distribution: 'gaussian',
    adaptation: 'fixed',
    scope: 'global',
    selfSigma: 0.05,
    mutateActivations: false,
    activationMutationRate: 0.05,
    mutateHyperparams: true,
    addNeuronRate: 0.01,
    removeNeuronRate: 0.01,
    addLayerRate: 0.005,
    removeLayerRate: 0.005,
    addConnectionRate: 0.01,
    removeConnectionRate: 0.01,
  };

  const crossover: CrossoverGenome = {
    type: 'uniform',
    probability: 0.7,
    blendAlpha: 0.5,
    sbxEta: 2,
  };

  const gaControl: GAControlGenome = {
    populationSize: 20,
    elitismFraction: 0.1,
    survivorFraction: 0.5,
    selectionType: 'tournament',
    fitnessType: 'total_pnl',
    episodesPerIndividual: 3,
    seedsPerEval: 2,
    rewardThreshold: Infinity,
    stagnationPatience: 15,
    maxGenerations: 100,
    timeBudgetMs: 5 * 60 * 1_000,
    envSeed: 42,
    mutationSeed: 1337,
    networkSeed: 7,
    mutationRate: 0.1,
    mutationStd: 0.05,
  };

  return { id, generation, network, rl, mutation, crossover, gaControl };
}
