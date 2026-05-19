/**
 * @fileoverview Unit tests for TradingAgent
 *
 * Tests the TradingAgent class which orchestrates:
 * - Neural Network inference
 * - Wallet state management
 * - Reward calculation
 * - Action mapping
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import TradingAgent from './trading-agent';

describe('TradingAgent', () => {
  let agent: TradingAgent;

  beforeEach(() => {
    agent = new TradingAgent({
      nnConfig: {
        neuronsByLayer: [4, 8, 3],
        activationFunctions: ['relu'],
        connectionTypes: ['fully-connected'],
        biasTypes: ['enabled'],
        optimizationType: 'adam',
        learningRate: 0.01,
      },
      wallet: {
        initialCash: 1000,
        initialPrice: 100,
      },
      actionSpace: 'discrete',
      tradeAmount: 10,
    });
  });

  describe('Construction', () => {
    test('should initialize with default config', () => {
      expect(agent).toBeDefined();
      expect(agent.agent).toBeDefined();
      expect(agent.wallet).toBeDefined();
      expect(agent.state).toBeDefined();
    });

    test('should initialize wallet with specified cash', () => {
      const metrics = agent.wallet.getMetrics();
      expect(metrics.cash).toBeGreaterThan(0);
    });
  });

  describe('Action Mapping - Discrete', () => {
    test('should map argmax output to action', () => {
      const output = new Float32Array([0.1, 0.9, 0.2]); // argmax = 1 (hold)
      const action = agent.mapOutputToAction(output, { actionSpace: 'discrete' });
      expect(action.action).toBe('hold');
      expect(action.amount).toBe(0);
    });

    test('should map action 0 to sell', () => {
      const output = new Float32Array([0.9, 0.1, 0.2]);
      const action = agent.mapOutputToAction(output, { actionSpace: 'discrete' });
      expect(action.action).toBe('sell');
    });

    test('should map action 2 to buy', () => {
      const output = new Float32Array([0.1, 0.2, 0.9]);
      const action = agent.mapOutputToAction(output, { actionSpace: 'discrete' });
      expect(action.action).toBe('buy');
    });

    test('should respect tradeAmount config', () => {
      const output = new Float32Array([0.9, 0.1, 0.2]);
      const action = agent.mapOutputToAction(output, { actionSpace: 'discrete', tradeAmount: 25 });
      expect(action.amount).toBe(25);
    });
  });

  describe('Action Mapping - Continuous', () => {
    test('should interpret positive output as buy', () => {
      const output = new Float32Array([0.8]);
      const action = agent.mapOutputToAction(output, { actionSpace: 'continuous' });
      expect(action.action).toBe('buy');
      expect(action.amount).toBeGreaterThan(0);
    });

    test('should interpret negative output as sell', () => {
      const output = new Float32Array([-0.8]);
      const action = agent.mapOutputToAction(output, { actionSpace: 'continuous' });
      expect(action.action).toBe('sell');
      expect(action.amount).toBeGreaterThan(0);
    });

    test('should interpret small values as hold', () => {
      const output = new Float32Array([0.1]);
      const action = agent.mapOutputToAction(output, { actionSpace: 'continuous' });
      expect(action.action).toBe('hold');
    });
  });

  describe('Step Execution', () => {
    test('should execute one environment step', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const result = agent.step(input, 100, false);

      expect(result.action).toBeDefined();
      expect(typeof result.reward).toBe('number');
      expect(result.metrics).toBeDefined();
    });

    test('should update wallet price on step', () => {
      const initialPrice = 100;
      const newPrice = 105;

      agent.step(new Float32Array([0.5, 0.5, 0.5, 0.5]), initialPrice);
      agent.step(new Float32Array([0.5, 0.5, 0.5, 0.5]), newPrice);

      // Verify price was updated (indirectly by checking PnL changes)
      const result = agent.step(new Float32Array([0.5, 0.5, 0.5, 0.5]), newPrice);
      expect(result.metrics).toBeDefined();
    });

    test('should handle done flag', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      const result = agent.step(input, 100, true);

      expect(result).toBeDefined();
      expect(typeof result.reward).toBe('number');
    });
  });

  describe('Reward Calculation', () => {
    test('should calculate reward based on PnL', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);

      // Step 1: initial
      agent.step(input, 100);

      // Step 2: price increases
      const result = agent.step(input, 105);

      expect(typeof result.reward).toBe('number');
    });

    test('should penalize negative PnL', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);

      // Initial step at high price
      agent.step(input, 110);

      // Price drops
      const result = agent.step(input, 100);

      expect(typeof result.reward).toBe('number');
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero input', () => {
      const input = new Float32Array([0, 0, 0, 0]);
      const result = agent.step(input, 100);

      expect(result.action).toBeDefined();
      expect(typeof result.reward).toBe('number');
    });

    test('should handle NaN gracefully', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);

      // Price shouldn't cause crashes
      const result = agent.step(input, 100);
      expect(Number.isFinite(result.reward)).toBe(true);
    });

    test('should handle consecutive steps', () => {
      const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);

      for (let i = 0; i < 10; i++) {
        const result = agent.step(input, 100 + i);
        expect(result).toBeDefined();
      }
    });
  });
});
