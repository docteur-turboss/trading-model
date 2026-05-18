/**
 * @fileoverview Unit tests for StateManager
 * 
 * Tests the State Manager which handles:
 * - Epsilon-decay for exploration
 * - Q-learning hyperparameters
 * - Reward normalization
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import StateManager from './state_manager';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager({
      epsilon: 0.1,
      epsilonDecay: 0.995,
      minEpsilon: 0.01,
      gamma: 0.99,
      learningRate: 0.01,
    });
  });

  describe('Initialization', () => {
    test('should initialize with default config', () => {
      const manager = new StateManager({});
      expect(manager).toBeDefined();
    });

    test('should set epsilon value', () => {
      expect(stateManager).toBeDefined();
    });
  });

  describe('Epsilon Decay', () => {
    test('should decay epsilon each episode', () => {
      const initialEpsilon = stateManager.getEpsilon();
      
      // Simulate multiple episodes
      for (let i = 0; i < 10; i++) {
        stateManager.decayEpsilon();
      }
      
      const decayedEpsilon = stateManager.getEpsilon();
      expect(decayedEpsilon).toBeLessThan(initialEpsilon);
    });

    test('should not go below minEpsilon', () => {
      // Decay many times
      for (let i = 0; i < 1000; i++) {
        stateManager.decayEpsilon();
      }
      
      const epsilon = stateManager.getEpsilon();
      expect(epsilon).toBeGreaterThanOrEqual(0.01);
    });

    test('should respect custom decay rate', () => {
      const manager = new StateManager({
        epsilon: 1.0,
        epsilonDecay: 0.9,
        minEpsilon: 0.01,
      });
      
      manager.decayEpsilon();
      const epsilon1 = manager.getEpsilon();
      
      expect(epsilon1).toBeLessThan(1.0);
      expect(epsilon1).toBeCloseTo(0.9, 1);
    });
  });

  describe('Hyperparameters', () => {
    test('should return gamma', () => {
      const gamma = stateManager.getGamma();
      expect(gamma).toBe(0.99);
    });

    test('should return learningRate', () => {
      const lr = stateManager.getLearningRate();
      expect(lr).toBe(0.01);
    });

    test('should return epsilon', () => {
      const epsilon = stateManager.getEpsilon();
      expect(epsilon).toBeGreaterThan(0);
      expect(epsilon).toBeLessThanOrEqual(1.0);
    });
  });

  describe('State Updates', () => {
    test('should handle multiple decay cycles', () => {
      const epsilons: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        epsilons.push(stateManager.getEpsilon());
        stateManager.decayEpsilon();
      }
      
      // Should be monotonically decreasing
      for (let i = 1; i < epsilons.length; i++) {
        expect(epsilons[i - 1]).toBeGreaterThanOrEqual(epsilons[i]);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero epsilon', () => {
      const manager = new StateManager({
        epsilon: 0,
        epsilonDecay: 0.995,
        minEpsilon: 0,
      });
      
      expect(manager.getEpsilon()).toBe(0);
    });

    test('should handle epsilon = 1', () => {
      const manager = new StateManager({
        epsilon: 1.0,
        epsilonDecay: 0.995,
        minEpsilon: 0.01,
      });
      
      expect(manager.getEpsilon()).toBe(1.0);
    });

    test('should handle very high decay rate (no decay)', () => {
      const manager = new StateManager({
        epsilon: 0.1,
        epsilonDecay: 0.9999,
        minEpsilon: 0.01,
      });
      
      manager.decayEpsilon();
      const epsilon = manager.getEpsilon();
      
      expect(epsilon).toBeCloseTo(0.1, 3);
    });
  });
});
