import { describe, it, expect, beforeEach } from '@jest/globals';
import { Agent } from '../../../src/core/neural-network/agent';
import type { NeuralNetworkConfig } from '../../../src/core/neural-network/type';

function makeConfig(overrides?: Partial<NeuralNetworkConfig>): NeuralNetworkConfig {
  return {
    neuronsByLayer: [4, 6, 3],
    activationType: ['ReLu', 'sigmoid'],
    initialisationType: 'zeros',
    lossFunctionType: 'mean-squared-error',
    normalisationType: 'none',
    connectionType: 'fully-connected',
    learningRate: 0.01,
    enablePool: true,
    poolMaxSize: 100,
    ...overrides,
  };
}

describe('Agent', () => {
  describe('constructor', () => {
    it('should create an Agent with valid config', () => {
      const agent = new Agent(makeConfig());

      expect(agent.nn).toBeDefined();
    });

    it('should throw when neuronsByLayer has fewer than 2 entries', () => {
      expect(() => new Agent(makeConfig({ neuronsByLayer: [3] }))).toThrow();
    });

    it('should create neural network inside agent', () => {
      const agent = new Agent(makeConfig());

      expect(agent.nn.parameterCount()).toBeGreaterThan(0);
    });
  });

  describe('addScore / getAverageScore / getTotalScore', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent(makeConfig());
    });

    it('should return 0 average when no scores added', () => {
      expect(agent.getAverageScore()).toBe(0);
    });

    it('should return 0 total when no scores added', () => {
      expect(agent.getTotalScore()).toBe(0);
    });

    it('should record a single score', () => {
      agent.addScore(10);

      expect(agent.getAverageScore()).toBe(10);
      expect(agent.getTotalScore()).toBe(10);
    });

    it('should compute average of multiple scores', () => {
      agent.addScore(10);
      agent.addScore(20);
      agent.addScore(30);

      expect(agent.getAverageScore()).toBe(20);
      expect(agent.getTotalScore()).toBe(60);
    });

    it('resetScores should clear all scores', () => {
      agent.addScore(10);
      agent.addScore(20);

      agent.resetScores();

      expect(agent.getAverageScore()).toBe(0);
    });
  });

  describe('fastForward', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent(makeConfig());
    });

    it('should return output vector from the network', () => {
      const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
      const output = agent.fastForward(input);

      expect(output.length).toBe(3);
    });

    it('should push experience into the pool when pool is enabled', () => {
      const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
      agent.fastForward(input, 1, new Float32Array([0.1, 0.2, 0.3]));

      expect(agent.getPoolSize()).toBe(1);
    });

    it('should accept reward, nextState, and done parameters', () => {
      const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
      agent.fastForward(input, 1.5, new Float32Array([0.1, 0.2, 0.3]), false);

      const pool = agent.getPool();

      expect(pool[0].reward).toBe(1.5);
      expect(pool[0].done).toBe(false);
    });

    it('should not push to pool when enablePool is false', () => {
      const noPool = new Agent(makeConfig({ enablePool: false }));
      const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);

      noPool.fastForward(input, 1, new Float32Array([0.1, 0.2, 0.3]));

      expect(noPool.getPoolSize()).toBe(0);
    });
  });

  describe('pool operations', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent(makeConfig());
    });

    it('getPool should return a copy of the pool', () => {
      agent.fastForward(new Float32Array([0.5, -0.3, 0.1, 0.8]));

      const pool = agent.getPool();

      expect(Array.isArray(pool)).toBe(true);
      expect(pool.length).toBe(1);
    });

    it('clearPool should empty the pool', () => {
      agent.fastForward(new Float32Array([0.5, -0.3, 0.1, 0.8]));
      agent.clearPool();

      expect(agent.getPoolSize()).toBe(0);
    });

    it('samplePool should return requested batch size', () => {
      for (let i = 0; i < 10; i++) {
        agent.fastForward(new Float32Array([0.5, -0.3, 0.1, i * 0.1]));
      }

      const batch = agent.samplePool(3);

      expect(batch.length).toBe(3);
    });

    it('samplePool should throw when batch exceeds pool size', () => {
      expect(() => agent.samplePool(5)).toThrow();
    });

    it('should enforce FIFO poolMaxSize eviction', () => {
      const small = new Agent(makeConfig({ poolMaxSize: 3 }));
      for (let i = 0; i < 10; i++) {
        small.fastForward(new Float32Array([0.5, -0.3, 0.1, i * 0.1]));
      }

      expect(small.getPoolSize()).toBe(3);
    });
  });

  describe('learnSupervised', () => {
    it('should train on a single sample and remove it from pool', () => {
      const agent = new Agent(makeConfig({ learningRate: 0.01 }));
      const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);
      const target = new Float32Array([1, 0, 0]);

      agent.fastForward(input);
      agent.learnSupervised(input, target);

      expect(agent.getPoolSize()).toBe(0);
    });
  });

  describe('learnFromPool', () => {
    it('should train on all pooled experiences with targets', () => {
      const agent = new Agent(makeConfig({ learningRate: 0.01 }));
      const input = new Float32Array([0.5, -0.3, 0.1, 0.8]);

      agent.fastForward(input);

      // Manually attach target to pool entries
      const pool = agent.getPool();
      pool[0].target = new Float32Array([1, 0, 0]);

      agent.learnFromPool();

      expect(agent.getPoolSize()).toBe(0);
    });
  });

  describe('learnQLearning', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent(makeConfig({ learningRate: 0.01 }));
    });

    it('should throw when reward is missing', () => {
      const exp = {
        input: new Float32Array([0.5, -0.3, 0.1, 0.8]),
        output: new Float32Array([0.1, 0.2, 0.3]),
        nextState: new Float32Array([0.1, 0.2, 0.3]),
      };

      expect(() =>
        agent.learnQLearning(exp as unknown as Parameters<typeof agent.learnQLearning>[0])
      ).toThrow();
    });

    it('should throw when nextState is missing', () => {
      const exp = {
        input: new Float32Array([0.5, -0.3, 0.1, 0.8]),
        output: new Float32Array([0.1, 0.2, 0.3]),
        reward: 1,
      };

      expect(() =>
        agent.learnQLearning(exp as unknown as Parameters<typeof agent.learnQLearning>[0])
      ).toThrow();
    });

    it('should process Q-learning update without error', () => {
      agent.fastForward(
        new Float32Array([0.5, -0.3, 0.1, 0.8]),
        1.0,
        new Float32Array([0.1, 0.2, 0.3, 0.9]),
        false
      );

      const pool = agent.getPool();
      const exp = pool[0];

      expect(() => agent.learnQLearning(exp)).not.toThrow();
    });
  });
});
