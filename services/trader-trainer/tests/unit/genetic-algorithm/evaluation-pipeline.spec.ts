import { describe, it, expect, jest } from '@jest/globals';
import {
  evaluateGenomeAllWindows,
  pooledEval,
} from '../../../src/core/genetic-algorithm/evaluation-pipeline';
import type { RLBackend } from '../../../src/core/genetic-algorithm/evaluation-pipeline';
import type { Experience } from '../../../src/core/genetic-algorithm/shared-types';

const minimalGenome = {
  id: 'test',
  generation: 0,
  network: { inputDim: 3, outputDim: 3, hiddenLayers: [], normalization: 'none' as const },
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

function makeStep(features: number[]) {
  return { features: new Float32Array(features), price: 100 };
}

function makeMockBackend(poolSize: number): RLBackend {
  const pool: Experience[] = [];
  for (let i = 0; i < poolSize; i++) {
    pool.push({
      kind: 'qlearning',
      input: new Float32Array([0.1, 0.2, 0.3]),
      output: new Float32Array([0.1, 0.2, 0.3]),
      reward: 1,
      nextState: new Float32Array([0.1, 0.2, 0.3]),
      done: false,
    });
  }
  return {
    forwardPass: jest.fn((_f: Float32Array) => new Float32Array([0.5, 0.5, 0.5])),
    step: jest.fn(() => ({ reward: 1 })),
    train: jest.fn(),
    getWeights: jest.fn(() => new Float32Array([0.1, 0.2])),
    setWeights: jest.fn(),
    getPnL: jest.fn(() => 50),
    resetEpisode: jest.fn(),
    getExperiencePool: jest.fn(() => pool),
  };
}

describe('evaluateGenomeAllWindows', () => {
  it('should call backend.train when pool has >= 2 entries', async () => {
    const windowSets = [
      {
        id: 'w1',
        train: [makeStep([0.1, 0.2, 0.3]), makeStep([0.4, 0.5, 0.6])],
        validation: [makeStep([0.7, 0.8, 0.9])],
      },
    ];
    const trainMock = jest.fn();
    const backendFactory = jest.fn(() => ({
      ...makeMockBackend(2),
      train: trainMock,
    }));
    await evaluateGenomeAllWindows(minimalGenome as any, windowSets, backendFactory as any);
    expect(trainMock).toHaveBeenCalled();
  });

  it('should handle empty window sets gracefully', async () => {
    const backendFactory = jest.fn(() => makeMockBackend(2));
    const result = await evaluateGenomeAllWindows(minimalGenome as any, [], backendFactory as any);
    expect(result.updatedGenome).toBeDefined();
    expect(result.meta.episodesRun).toBe(0);
  });

  it('should handle frameSkip > 1', async () => {
    const genome = {
      ...minimalGenome,
      rl: {
        ...minimalGenome.rl,
        horizon: { ...minimalGenome.rl.horizon, frameSkip: 3, maxEpisodeLength: 10 },
      },
    };
    const windowSets = [
      {
        id: 'w1',
        train: Array.from({ length: 10 }, (_, i) => makeStep([i * 0.1, i * 0.1, i * 0.1])),
        validation: Array.from({ length: 5 }, (_, i) => makeStep([i * 0.1, i * 0.1, i * 0.1])),
      },
    ];
    const backendFactory = jest.fn(() => makeMockBackend(2));
    const result = await evaluateGenomeAllWindows(genome as any, windowSets, backendFactory as any);
    expect(result.updatedGenome).toBeDefined();
  });

  it('should apply reward shaping with clip and normalize', async () => {
    const genome = {
      ...minimalGenome,
      rl: {
        ...minimalGenome.rl,
        rewardShaping: {
          clip: true,
          clipMin: -1,
          clipMax: 1,
          scale: false,
          scaleFactor: 1,
          normalize: true,
          sparse: false,
        },
      },
    };
    const windowSets = [
      {
        id: 'w1',
        train: [makeStep([0.1, 0.2, 0.3]), makeStep([0.4, 0.5, 0.6])],
        validation: [makeStep([0.7, 0.8, 0.9])],
      },
    ];
    const backendFactory = jest.fn(() => makeMockBackend(2));
    const result = await evaluateGenomeAllWindows(genome as any, windowSets, backendFactory as any);
    expect(result.updatedGenome).toBeDefined();
  });

  it('should handle genome with hidden layers for complexity estimation', async () => {
    const genome = {
      ...minimalGenome,
      network: {
        ...minimalGenome.network,
        hiddenLayers: [
          { neurons: 10, activation: 'relu' },
          { neurons: 5, activation: 'sigmoid' },
        ],
      },
    };
    const windowSets = [
      {
        id: 'w1',
        train: [makeStep([0.1, 0.2, 0.3])],
        validation: [makeStep([0.7, 0.8, 0.9])],
      },
    ];
    const backendFactory = jest.fn(() => makeMockBackend(2));
    const result = await evaluateGenomeAllWindows(genome as any, windowSets, backendFactory as any);
    expect(result.objectives.negFlops).toBeLessThan(0);
  });

  it('should skip training when pool has fewer than 2 entries', async () => {
    const windowSets = [
      {
        id: 'w1',
        train: [makeStep([0.1, 0.2, 0.3]), makeStep([0.4, 0.5, 0.6])],
        validation: [makeStep([0.7, 0.8, 0.9])],
      },
    ];
    const trainMock = jest.fn();
    const backendFactory = jest.fn(() => ({
      ...makeMockBackend(1),
      train: trainMock,
    }));
    const result = await evaluateGenomeAllWindows(
      minimalGenome as any,
      windowSets,
      backendFactory as any
    );
    expect(result.updatedGenome).toBeDefined();
    expect(trainMock).not.toHaveBeenCalled();
  });

  it('should throw invariant error when inputDim is invalid', async () => {
    const badGenome = {
      ...minimalGenome,
      network: { ...minimalGenome.network, inputDim: 0 },
    };
    const windowSets = [
      {
        id: 'w1',
        train: [makeStep([0.1, 0.2, 0.3]), makeStep([0.4, 0.5, 0.6])],
        validation: [makeStep([0.7, 0.8, 0.9])],
      },
    ];
    const backendFactory = jest.fn(() => makeMockBackend(2));
    await expect(
      evaluateGenomeAllWindows(badGenome as any, windowSets, backendFactory as any)
    ).rejects.toThrow('[Invariant] inputDim must be positive');
  });

  it('should handle sparse reward mode', async () => {
    const genome = {
      ...minimalGenome,
      rl: {
        ...minimalGenome.rl,
        rewardShaping: {
          clip: true,
          clipMin: -1,
          clipMax: 1,
          scale: false,
          scaleFactor: 1,
          normalize: false,
          sparse: true,
        },
      },
    };
    const windowSets = [
      {
        id: 'w1',
        train: [makeStep([0.1, 0.2, 0.3]), makeStep([0.4, 0.5, 0.6])],
        validation: [makeStep([0.7, 0.8, 0.9])],
      },
    ];
    const backendFactory = jest.fn(() => makeMockBackend(2));
    const result = await evaluateGenomeAllWindows(genome as any, windowSets, backendFactory as any);
    expect(result.updatedGenome).toBeDefined();
    expect(result.meta.rawScores.length).toBeGreaterThan(0);
  });
});

describe('pooledEval', () => {
  it('should process all items with bounded concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = jest.fn(async (x: number) => x * 2);
    const results = await pooledEval(items, 2, fn);
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('should handle empty items array', async () => {
    const fn = jest.fn(async (x: number) => x);
    const results = await pooledEval([], 2, fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should handle single item', async () => {
    const fn = jest.fn(async (x: number) => x * 3);
    const results = await pooledEval([7], 5, fn);
    expect(results).toEqual([21]);
  });

  it('should handle items count less than concurrency', async () => {
    const fn = jest.fn(async (x: number) => x);
    const results = await pooledEval([1, 2], 10, fn);
    expect(results).toEqual([1, 2]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
