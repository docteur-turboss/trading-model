import { describe, it, expect, beforeEach } from '@jest/globals';
import StateManager from '../../../src/core/agent/state-manager';

describe('StateManager', () => {
  describe('default configuration', () => {
    let sm: StateManager;

    beforeEach(() => {
      sm = new StateManager();
    });

    it('should start with epsilon at 1.0 by default', () => {
      expect(sm.getEpsilon()).toBe(1.0);
    });

    it('should have gamma at 0.99 by default', () => {
      expect(sm.gamma).toBe(0.99);
    });

    it('should decay epsilon multiplicatively', () => {
      sm.decayEpsilon();

      expect(sm.getEpsilon()).toBeLessThan(1.0);
    });

    it('should clamp epsilon at epsilonMin', () => {
      for (let i = 0; i < 2000; i++) {
        sm.decayEpsilon();
      }

      expect(sm.getEpsilon()).toBeGreaterThanOrEqual(0.01);
    });

    it('resetEpsilon should restore epsilon to 1.0', () => {
      sm.decayEpsilon();
      sm.decayEpsilon();
      sm.decayEpsilon();

      sm.resetEpsilon();

      expect(sm.getEpsilon()).toBe(1.0);
    });
  });

  describe('custom configuration', () => {
    it('should use provided epsilonStart', () => {
      const sm = new StateManager({ epsilonStart: 0.5 });

      expect(sm.getEpsilon()).toBe(0.5);
    });

    it('should use provided epsilonMin as floor', () => {
      const sm = new StateManager({ epsilonStart: 0.5, epsilonMin: 0.1, epsilonDecay: 0.5 });
      sm.decayEpsilon();
      sm.decayEpsilon();
      sm.decayEpsilon();
      sm.decayEpsilon();

      expect(sm.getEpsilon()).toBeGreaterThanOrEqual(0.1);
    });

    it('should use provided epsilonDecay rate', () => {
      const sm = new StateManager({ epsilonStart: 1.0, epsilonDecay: 0.5 });
      sm.decayEpsilon();

      expect(sm.getEpsilon()).toBeCloseTo(0.5, 5);
    });

    it('should use provided gamma', () => {
      const sm = new StateManager({ gamma: 0.95 });

      expect(sm.gamma).toBe(0.95);
    });
  });

  describe('decayEpsilon', () => {
    it('should decay epsilon by the configured rate', () => {
      const sm = new StateManager({ epsilonStart: 1.0, epsilonDecay: 0.9 });
      sm.decayEpsilon();

      expect(sm.getEpsilon()).toBeCloseTo(0.9, 5);
    });

    it('should not go below epsilon floor', () => {
      const sm = new StateManager({ epsilonStart: 1.0, epsilonMin: 0.5, epsilonDecay: 0.5 });

      sm.decayEpsilon();
      sm.decayEpsilon();

      expect(sm.getEpsilon()).toBe(0.5);
    });

    it('should work with many consecutive decays', () => {
      const sm = new StateManager({ epsilonStart: 1.0, epsilonDecay: 0.9, epsilonMin: 0.001 });

      for (let i = 0; i < 100; i++) {
        sm.decayEpsilon();
      }

      expect(sm.getEpsilon()).toBeGreaterThan(0);
      expect(sm.getEpsilon()).toBeLessThan(1.0);
    });
  });

  describe('resetEpsilon', () => {
    it('should reset to epsilonStart when custom start provided', () => {
      const sm = new StateManager({ epsilonStart: 0.3 });
      sm.decayEpsilon();

      sm.resetEpsilon();

      expect(sm.getEpsilon()).toBe(0.3);
    });

    it('should reset to 1.0 when no custom start provided', () => {
      const sm = new StateManager();
      sm.decayEpsilon();
      sm.decayEpsilon();

      sm.resetEpsilon();

      expect(sm.getEpsilon()).toBe(1.0);
    });
  });
});
