import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MarketDataBuffer } from '../../../src/core/market-data-buffer';
import { feedCandles } from '../../fixtures/market-data.fixture';

jest.mock<{ env: any }>('../../../src/config/env', () => ({
  env: {
    TRAINER_SYMBOLS: 'BTCUSDT',
    TRAINER_DATA_WINDOW: 500,
    TRAINER_VALIDATION_SPLIT: 0.2,
    TRAINER_GENERATIONS: 10,
    TRAINER_POPULATION_SIZE: 5,
    TRAINER_TIME_BUDGET_MS: 60000,
    TRAINER_EPISODES_PER_INDIVIDUAL: 2,
  },
}));

describe('Trainer', () => {
  let dataBuffer: MarketDataBuffer;

  beforeEach(() => {
    dataBuffer = new MarketDataBuffer(500);
  });

  describe('initial state', () => {
    it('should return null from getBestAgentSummary before training', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      const summary = trainer.getBestAgentSummary();

      expect(summary).toBeNull();
    });

    it('should return false from isTraining before training', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      expect(trainer.isTraining()).toBe(false);
    });

    it('should return 0 from getGeneration before training', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      expect(trainer.getGeneration()).toBe(0);
    });

    it('should return empty string from getCurrentSymbol before training', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      expect(trainer.getCurrentSymbol()).toBe('');
    });

    it('should return null from getGenerationContext before training', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      expect(trainer.getGenerationContext()).toBeNull();
    });
  });

  describe('train with insufficient data', () => {
    it('should not start training with fewer than 10 steps', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);
      feedCandles(dataBuffer, 'BTCUSDT', 5);

      await trainer.train('BTCUSDT');

      expect(trainer.isTraining()).toBe(false);
      expect(trainer.getBestAgentSummary()).toBeNull();
    });

    it('should return immediately if already training', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);
      feedCandles(dataBuffer, 'BTCUSDT', 100);

      Object.defineProperty(trainer, 'training', { value: true, writable: false });

      await trainer.train('BTCUSDT');

      expect(trainer.isTraining()).toBe(true);
    });
  });

  describe('computeSharpe', () => {
    it('should return 0 for empty scores array', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      const computeSharpe = (Trainer.prototype as unknown as Record<string, unknown>)
        .computeSharpe as (scores: number[]) => number;

      expect(computeSharpe([])).toBe(0);
    });

    it('should return 0 for single-element scores array', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      const computeSharpe = (Trainer.prototype as unknown as Record<string, unknown>)
        .computeSharpe as (scores: number[]) => number;

      expect(computeSharpe([1])).toBe(0);
    });

    it('should return mean when all scores are identical (std is zero)', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      const computeSharpe = (Trainer.prototype as unknown as Record<string, unknown>)
        .computeSharpe as (scores: number[]) => number;

      expect(computeSharpe([5, 5, 5])).toBe(5);
    });

    it('should return positive value for increasing scores', async () => {
      const { Trainer } = await import('../../../src/core/trainer');
      const trainer = new Trainer(dataBuffer);

      const computeSharpe = (Trainer.prototype as unknown as Record<string, unknown>)
        .computeSharpe as (scores: number[]) => number;

      expect(computeSharpe([1, 2])).toBeGreaterThan(0);
    });
  });
});
