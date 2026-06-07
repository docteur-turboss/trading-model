import { describe, it, expect } from '@jest/globals';
import { estimateComplexity, computeAdjustedFitness } from '../../../src/core/genetic-algorithm/complexity-estimator';

describe('estimateComplexity', () => {
  const baseGenome = {
    id: 'test',
    generation: 0,
    network: {
      inputDim: 10,
      outputDim: 5,
      hiddenLayers: [{ neurons: 20, activation: 'relu' }],
      normalization: 'none' as const,
    },
    rl: {
      gamma: 0.99,
      learningRate: 0.001,
      discretePolicy: {
        type: 'epsilon_greedy' as const,
        epsilonStart: 1.0,
        epsilonMin: 0.01,
        epsilonDecay: 0.995,
        temperature: 1.0,
      },
      continuousPolicy: {
        type: 'action_clipping' as const,
        clipMin: -1,
        clipMax: 1,
        noiseStd: 0.1,
        noiseDecay: 0.995,
      },
      replayBuffer: {
        bufferSize: 128,
        prioritized: false,
        alphaPER: 0.6,
        betaPER: 0.4,
        betaAnneal: false,
      },
      horizon: { maxEpisodeLength: 100, frameSkip: 1, nStepReturn: 3 },
      rewardShaping: {
        clip: false,
        clipMin: -1,
        clipMax: 1,
        scale: false,
        scaleFactor: 1,
        normalize: false,
        sparse: false,
      },
    },
    mutation: {
      rate: 0.1,
      sigma: 0.5,
      noiseStd: 0.1,
      distribution: 'gaussian' as const,
      adaptation: 'fixed' as const,
      scope: 'global' as const,
      selfSigma: 0.5,
      mutateActivations: false,
      activationMutationRate: 0.1,
      mutateHyperparams: false,
      addNeuronRate: 0.1,
      removeNeuronRate: 0.1,
      addLayerRate: 0.1,
      removeLayerRate: 0.1,
      addConnectionRate: 0.1,
      removeConnectionRate: 0.1,
    },
    crossover: { type: 'uniform' as const, probability: 0.5, blendAlpha: 0.5, sbxEta: 15 },
    gaControl: {
      populationSize: 20,
      elitismFraction: 0.1,
      survivorFraction: 0.5,
      selectionType: 'tournament' as const,
      fitnessType: 'total_pnl' as const,
      episodesPerIndividual: 2,
      seedsPerEval: 1,
      rewardThreshold: Infinity,
      stagnationPatience: 10,
      maxGenerations: 10,
      timeBudgetMs: 60000,
      envSeed: 1,
      mutationSeed: 1,
      networkSeed: 1,
      mutationRate: 0.1,
      mutationStd: 0.5,
    },
    fitness: 0,
  };

  it('should compute FLOPs and penalty for a simple network', () => {
    const result = estimateComplexity(baseGenome as any);
    expect(result.inferenceFLOPs).toBeGreaterThan(0);
    expect(result.penalty).toBeGreaterThanOrEqual(0);
    expect(result.penalty).toBeLessThanOrEqual(1);
  });

  it('should use default cost multiplier for unknown activation', () => {
    const genome = {
      ...baseGenome,
      network: {
        ...baseGenome.network,
        hiddenLayers: [{ neurons: 20, activation: 'leaky_relu' as string }],
      },
    };
    const result = estimateComplexity(genome as any);
    expect(result.inferenceFLOPs).toBeGreaterThan(0);
  });

  it('should handle empty hidden layers', () => {
    const genome = {
      ...baseGenome,
      network: {
        ...baseGenome.network,
        hiddenLayers: [],
      },
    };
    const result = estimateComplexity(genome as any);
    expect(result.inferenceFLOPs).toBeGreaterThan(0);
  });

  it('should scale penalty with complexity', () => {
    const smallGenome = {
      ...baseGenome,
      network: {
        ...baseGenome.network,
        hiddenLayers: [{ neurons: 4, activation: 'relu' }],
      },
    };
    const largeGenome = {
      ...baseGenome,
      network: {
        ...baseGenome.network,
        hiddenLayers: [
          { neurons: 512, activation: 'gelu' },
          { neurons: 256, activation: 'swish' },
        ],
      },
    };
    const small = estimateComplexity(smallGenome as any);
    const large = estimateComplexity(largeGenome as any);
    expect(large.penalty).toBeGreaterThan(small.penalty);
  });

  it('should account for frameSkip in effective FLOPs', () => {
    const genomeSkip = {
      ...baseGenome,
      rl: {
        ...baseGenome.rl,
        horizon: { ...baseGenome.rl.horizon, frameSkip: 4 },
      },
    };
    const result = estimateComplexity(genomeSkip as any);
    expect(result.inferenceFLOPs).toBeGreaterThan(0);
  });
});

describe('computeAdjustedFitness', () => {
  it('should reduce fitness by penalty proportion', () => {
    const fitness = 100;
    const complexity = { inferenceFLOPs: 1000, penalty: 0.5 };
    const adjusted = computeAdjustedFitness(fitness, complexity, 0.2);
    expect(adjusted).toBe(100 * (1 - 0.2 * 0.5));
  });

  it('should use default lambdaPenalty when not provided', () => {
    const fitness = 100;
    const complexity = { inferenceFLOPs: 1000, penalty: 0.1 };
    const adjusted = computeAdjustedFitness(fitness, complexity);
    expect(adjusted).toBe(100 * (1 - 0.15 * 0.1));
  });

  it('should return same fitness when penalty is zero', () => {
    const fitness = 100;
    const complexity = { inferenceFLOPs: 0, penalty: 0 };
    const adjusted = computeAdjustedFitness(fitness, complexity, 0.5);
    expect(adjusted).toBe(100);
  });
});
