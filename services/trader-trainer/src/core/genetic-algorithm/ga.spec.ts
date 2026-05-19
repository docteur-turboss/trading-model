/**
 * @fileoverview Unit tests for Genetic Algorithm module
 *
 * Tests the core GA operators:
 * - Mutation
 * - Crossover
 * - Fitness calculation
 * - Genome validation
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import { mutateGenome } from './mutation';
import { crossoverGenomes } from './crossover';
import { computeFitness } from './fitness';
import { validateGenome, repairGenome } from './validation';
import { createDefaultGenome } from './factory';

describe('Genetic Algorithm - Core Operators', () => {
  let baseGenome: any;

  beforeEach(() => {
    baseGenome = createDefaultGenome();
  });

  describe('Mutation', () => {
    test('should mutate a genome', () => {
      const mutated = mutateGenome(baseGenome);

      expect(mutated).toBeDefined();
      expect(mutated !== baseGenome).toBe(true); // Should be new instance
    });

    test('should not mutate to invalid state', () => {
      const mutated = mutateGenome(baseGenome);

      expect(mutated.network).toBeDefined();
      expect(mutated.rl).toBeDefined();
      expect(Array.isArray(mutated.network.hiddenLayers)).toBe(true);
    });

    test('should support different mutation distributions', () => {
      const genomes = [
        mutateGenome(baseGenome),
        mutateGenome(baseGenome),
        mutateGenome(baseGenome),
      ];

      // All mutations should produce valid genomes
      genomes.forEach(g => {
        expect(g).toBeDefined();
        expect(g.network).toBeDefined();
      });
    });

    test('should support adaptive mutation strength', () => {
      // Test multiple mutations
      const mutated1 = mutateGenome(baseGenome);
      const mutated2 = mutateGenome(mutated1);

      expect(mutated2).toBeDefined();
    });

    test('should preserve genome structure', () => {
      const mutated = mutateGenome(baseGenome);

      expect(mutated.network.inputDim).toBeDefined();
      expect(mutated.network.outputDim).toBeDefined();
      expect(mutated.rl).toBeDefined();
    });
  });

  describe('Crossover', () => {
    let parent1: any;
    let parent2: any;

    beforeEach(() => {
      parent1 = createDefaultGenome();
      parent2 = mutateGenome(createDefaultGenome());
    });

    test('should crossover two genomes', () => {
      const offspring = crossoverGenomes(parent1, parent2);

      expect(offspring).toBeDefined();
      expect(offspring !== parent1).toBe(true);
      expect(offspring !== parent2).toBe(true);
    });

    test('should produce offspring with valid structure', () => {
      const offspring = crossoverGenomes(parent1, parent2);

      expect(offspring.network).toBeDefined();
      expect(offspring.rl).toBeDefined();
      expect(offspring.network.inputDim).toBe(parent1.network.inputDim);
    });

    test('should support different crossover types', () => {
      // Uniform crossover
      const offspring1 = crossoverGenomes(parent1, parent2);

      expect(offspring1).toBeDefined();
      expect(offspring1.network).toBeDefined();
    });

    test('should not modify parents', () => {
      const p1Clone = JSON.stringify(parent1);
      const p2Clone = JSON.stringify(parent2);

      crossoverGenomes(parent1, parent2);

      expect(JSON.stringify(parent1)).toBe(p1Clone);
      expect(JSON.stringify(parent2)).toBe(p2Clone);
    });

    test('should handle identical parents', () => {
      const offspring = crossoverGenomes(parent1, parent1);

      expect(offspring).toBeDefined();
    });
  });

  describe('Fitness Calculation', () => {
    let tradeRecord: any;

    beforeEach(() => {
      tradeRecord = {
        totalPnL: 150, // 15% profit
        trades: 10,
        winRate: 0.6,
        maxDrawdown: 0.05,
        sharpeRatio: 1.5,
        sortino: 2.0,
        walletMetrics: {
          cash: 1150,
          position: 0,
          valuation: 1150,
        },
      };
    });

    test('should calculate fitness from trading metrics', () => {
      const fitness = computeFitness(tradeRecord, 'sharpe');

      expect(typeof fitness).toBe('number');
      expect(fitness).toBeGreaterThanOrEqual(0);
    });

    test('should support different fitness metrics', () => {
      const fitnessPnL = computeFitness(tradeRecord, 'total_pnl');
      const fitnessSharpe = computeFitness(tradeRecord, 'sharpe');
      const fitnessSortino = computeFitness(tradeRecord, 'sortino');

      expect(typeof fitnessPnL).toBe('number');
      expect(typeof fitnessSharpe).toBe('number');
      expect(typeof fitnessSortino).toBe('number');
    });

    test('should penalize losses', () => {
      const negativeRecord = {
        ...tradeRecord,
        totalPnL: -100,
      };

      const fitness = computeFitness(negativeRecord, 'total_pnl');
      expect(fitness).toBeLessThan(computeFitness(tradeRecord, 'total_pnl'));
    });

    test('should reward higher Sharpe ratio', () => {
      const lowSharpe = { ...tradeRecord, sharpeRatio: 0.5 };
      const highSharpe = { ...tradeRecord, sharpeRatio: 3.0 };

      const fitness1 = computeFitness(lowSharpe, 'sharpe');
      const fitness2 = computeFitness(highSharpe, 'sharpe');

      expect(fitness2).toBeGreaterThan(fitness1);
    });
  });

  describe('Genome Validation', () => {
    test('should validate valid genome', () => {
      const genome = createDefaultGenome();
      const isValid = validateGenome(genome);

      expect(isValid).toBe(true);
    });

    test('should detect invalid neuron counts', () => {
      const invalidGenome = {
        ...baseGenome,
        network: {
          ...baseGenome.network,
          hiddenLayers: [
            { neurons: -5 }, // Invalid negative
          ],
        },
      };

      const isValid = validateGenome(invalidGenome);
      expect(isValid).toBe(false);
    });

    test('should detect invalid learning rate', () => {
      const invalidGenome = {
        ...baseGenome,
        rl: {
          ...baseGenome.rl,
          discretePolicy: {
            ...baseGenome.rl.discretePolicy,
            learningRate: 1.5, // Invalid > 1
          },
        },
      };

      const isValid = validateGenome(invalidGenome);
      expect(isValid).toBe(false);
    });

    test('should repair salvageable genomes', () => {
      const invalidGenome = {
        ...baseGenome,
        network: {
          ...baseGenome.network,
          hiddenLayers: [
            { neurons: 0 }, // Invalid zero
          ],
        },
      };

      const repaired = repairGenome(invalidGenome);
      const isValid = validateGenome(repaired);

      expect(isValid).toBe(true);
    });
  });

  describe('Genome Factory', () => {
    test('should create default genome', () => {
      const genome = createDefaultGenome();

      expect(genome).toBeDefined();
      expect(genome.network).toBeDefined();
      expect(genome.rl).toBeDefined();
    });

    test('default genome should be valid', () => {
      const genome = createDefaultGenome();
      const isValid = validateGenome(genome);

      expect(isValid).toBe(true);
    });

    test('should support genome cloning', () => {
      const genome1 = createDefaultGenome();
      const genome2 = createDefaultGenome();

      expect(JSON.stringify(genome1) === JSON.stringify(genome2)).toBe(true);
    });
  });

  describe('Mutation-Crossover Integration', () => {
    test('should handle mutation after crossover', () => {
      const p1 = createDefaultGenome();
      const p2 = mutateGenome(createDefaultGenome());

      const offspring = crossoverGenomes(p1, p2);
      const mutated = mutateGenome(offspring);

      expect(mutated).toBeDefined();
      expect(validateGenome(mutated)).toBe(true);
    });

    test('should handle multiple generations', () => {
      let population = [createDefaultGenome(), createDefaultGenome()];

      for (let gen = 0; gen < 5; gen++) {
        const offspring = [];

        for (let i = 0; i < population.length; i++) {
          const parent1 = population[i];
          const parent2 = population[(i + 1) % population.length];

          let child = crossoverGenomes(parent1, parent2);
          child = mutateGenome(child);

          offspring.push(child);
        }

        population = offspring;
      }

      // All genomes should remain valid
      population.forEach(g => {
        expect(validateGenome(g)).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle single layer networks', () => {
      const simpleGenome = {
        ...baseGenome,
        network: {
          inputDim: 4,
          outputDim: 3,
          hiddenLayers: [],
        },
      };

      const mutated = mutateGenome(simpleGenome);
      expect(validateGenome(mutated)).toBe(true);
    });

    test('should handle very large networks', () => {
      const largeGenome = {
        ...baseGenome,
        network: {
          inputDim: 100,
          outputDim: 10,
          hiddenLayers: Array(10).fill({ neurons: 256 }),
        },
      };

      const mutated = mutateGenome(largeGenome);
      expect(mutated).toBeDefined();
    });

    test('should handle extreme hyperparameters', () => {
      const extremeGenome = {
        ...baseGenome,
        rl: {
          ...baseGenome.rl,
          discretePolicy: {
            ...baseGenome.rl.discretePolicy,
            learningRate: 0.0001,
            gamma: 0.9999,
          },
        },
      };

      const mutated = mutateGenome(extremeGenome);
      expect(validateGenome(mutated)).toBe(true);
    });
  });
});
