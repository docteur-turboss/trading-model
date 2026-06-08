import { describe, it, expect, beforeEach } from '@jest/globals';
import { MarketDataBuffer } from '../../../src/core/market-data-buffer';
import {
  NormalizationStats,
  TradingSymbol,
  toSymbol,
  fromSymbol,
} from '../../../src/core/market-data-types';
import {
  makeCandle,
  makeTrade,
  makeOrderBook,
  makeOrderBookEmpty,
  makeBookTicker,
  makeBookTickerZeroBidAsk,
  makeTicker24h,
  feedCandles,
  resetFixtureSeq,
} from '../../fixtures/market-data.fixture';

describe('TradingSymbol', () => {
  it('should create branded symbol via toSymbol', () => {
    const sym = toSymbol('BTCUSDT');
    expect(fromSymbol(sym)).toBe('BTCUSDT');
  });

  it('should preserve identity through roundtrip', () => {
    const original = 'ETHUSDT';
    expect(fromSymbol(toSymbol(original))).toBe(original);
  });

  it('should create distinct symbols for different strings', () => {
    const a = toSymbol('BTCUSDT');
    const b = toSymbol('ETHUSDT');
    expect(fromSymbol(a)).not.toBe(fromSymbol(b));
  });

  it('should work as Map key', () => {
    const m = new Map<TradingSymbol, number>();
    const s1 = toSymbol('BTCUSDT');
    const s2 = toSymbol('BTCUSDT');
    m.set(s1, 100);
    expect(m.get(s2)).toBe(100);
  });

  it('TradingSymbol should be assignable to string', () => {
    const sym = toSymbol('TEST');
    const str: string = sym;
    expect(typeof str).toBe('string');
  });
});

describe('MarketDataBuffer', () => {
  let buffer: MarketDataBuffer;

  beforeEach(() => {
    resetFixtureSeq();
    buffer = new MarketDataBuffer({ maxSize: 100 });
  });

  it('should create buffer with default maxSize of 10000', () => {
    const buf = new MarketDataBuffer();
    feedCandles(buf, 'BTCUSDT', 10001);
    expect(buf.getCandleCount('BTCUSDT')).toBe(10000);
  });

  it('should evict oldest symbol under memory pressure with LRU policy', () => {
    const buf = new MarketDataBuffer({ maxMemoryMb: 0.001, evictionPolicy: 'LRU' });
    buf.addCandles('BTCUSDT', [makeCandle({ symbol: 'BTCUSDT', close: 50000, timestamp: 1 })]);
    buf.addCandles('ETHUSDT', [makeCandle({ symbol: 'ETHUSDT', close: 3000, timestamp: 1 })]);
    expect(buf.getCandleCount('BTCUSDT')).toBe(1);
  });

  describe('addCandles', () => {
    it('should start with no symbols and zero candle count', () => {
      expect(buffer.getSymbols()).toEqual([]);
      expect(buffer.getCandleCount('BTCUSDT')).toBe(0);
    });

    it('should increase candle count when candles are added', () => {
      feedCandles(buffer, 'BTCUSDT', 5);

      expect(buffer.getCandleCount('BTCUSDT')).toBe(5);
      expect(buffer.getSymbols()).toEqual(['BTCUSDT']);
    });

    it('should track multiple symbols independently', () => {
      feedCandles(buffer, 'BTCUSDT', 3);
      feedCandles(buffer, 'ETHUSDT', 4);

      expect(buffer.getCandleCount('BTCUSDT')).toBe(3);
      expect(buffer.getCandleCount('ETHUSDT')).toBe(4);
      expect(buffer.getSymbols()).toContain('BTCUSDT');
      expect(buffer.getSymbols()).toContain('ETHUSDT');
    });

    it('should return 0 for unknown symbol', () => {
      expect(buffer.getCandleCount('UNKNOWN')).toBe(0);
    });

    it('should respect maxSize bound', () => {
      const small = new MarketDataBuffer({ maxSize: 5 });
      feedCandles(small, 'BTCUSDT', 10);

      expect(small.getCandleCount('BTCUSDT')).toBe(5);
    });

    it('should handle empty candle arrays without adding symbol entries', () => {
      buffer.addCandles('BTCUSDT', []);

      expect(buffer.getCandleCount('BTCUSDT')).toBe(0);
    });
  });

  describe('buildMarketSteps', () => {
    it('should return empty array with fewer than 2 candles', () => {
      feedCandles(buffer, 'BTCUSDT', 1);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps).toEqual([]);
    });

    it('should return N-1 steps for N candles', () => {
      feedCandles(buffer, 'BTCUSDT', 50);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps.length).toBe(49);
    });

    it('should set step price from candle close', () => {
      buffer.addCandles('BTCUSDT', [makeCandle({ symbol: 'BTCUSDT', close: 100, timestamp: 1 })]);
      buffer.addCandles('BTCUSDT', [makeCandle({ symbol: 'BTCUSDT', close: 150, timestamp: 2 })]);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps[0].price).toBe(150);
    });

    it('should return empty array for unknown symbol', () => {
      const steps = buffer.buildMarketSteps('UNKNOWN');

      expect(steps).toEqual([]);
    });
  });

  describe('features', () => {
    it('should have 32 feature dimensions', () => {
      feedCandles(buffer, 'BTCUSDT', 50);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps[0].features.length).toBe(32);
    });

    it('should set bias feature at index 31 to 1.0', () => {
      feedCandles(buffer, 'BTCUSDT', 50);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      for (const step of steps) {
        expect(step.features[31]).toBe(1.0);
      }
    });

    it('should compute price change correctly', () => {
      buffer.addCandles('BTCUSDT', [makeCandle({ symbol: 'BTCUSDT', close: 100, timestamp: 1 })]);
      buffer.addCandles('BTCUSDT', [makeCandle({ symbol: 'BTCUSDT', close: 110, timestamp: 2 })]);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps[0].features[2]).toBeCloseTo(0.1, 5);
    });

    it('should populate all 32 indices with finite numbers', () => {
      feedCandles(buffer, 'BTCUSDT', 50);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      for (let i = 0; i < 32; i++) {
        expect(typeof steps[0].features[i]).toBe('number');
        expect(Number.isFinite(steps[0].features[i])).toBe(true);
      }
    });

    it('should handle edge case feature values gracefully', () => {
      buffer.addCandles('BTCUSDT', [makeCandle({ symbol: 'BTCUSDT', close: 0, timestamp: 1 })]);
      buffer.addCandles('BTCUSDT', [
        makeCandle({ symbol: 'BTCUSDT', high: 60, low: 60, close: 0, timestamp: 2 }),
      ]);

      buffer.addTrades('BTCUSDT', [
        {
          symbol: 'BTCUSDT',
          source: 'binance',
          timestamp: 0,
          market: 'crypto',
          price: 100,
          tradeId: BigInt(999),
          quantity: 0,
          side: 'buy' as const,
        },
      ]);

      buffer.setTicker24h('BTCUSDT', { ...makeTicker24h('BTCUSDT'), open: 0 });

      const steps = buffer.buildMarketSteps('BTCUSDT');
      expect(steps.length).toBe(1);

      expect(steps[0].features[2]).toBe(0);
      expect(steps[0].features[3]).toBe(0);
      expect(steps[0].features[4]).toBe(0);
      expect(steps[0].features[18]).toBe(0.5);
      expect(steps[0].features[19]).toBe(0);
      expect(steps[0].features[21]).toBe(0);
    });
  });

  describe('setOrderBook', () => {
    it('should populate order book features when candles exist', () => {
      buffer.setOrderBook('BTCUSDT', makeOrderBook('BTCUSDT'));
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      for (const idx of [9, 10, 11, 12]) {
        expect(typeof steps[0].features[idx]).toBe('number');
      }
    });

    it('should handle empty bids and asks gracefully', () => {
      buffer.setOrderBook('BTCUSDT', makeOrderBookEmpty('BTCUSDT'));
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps[0].features[9]).toBe(0);
      expect(steps[0].features[10]).toBe(0);
    });
  });

  describe('setBookTicker', () => {
    it('should populate book ticker features', () => {
      buffer.setBookTicker('BTCUSDT', makeBookTicker('BTCUSDT'));
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      for (const idx of [13, 14, 15]) {
        expect(typeof steps[0].features[idx]).toBe('number');
      }
    });

    it('should handle zero bid and ask values', () => {
      buffer.setBookTicker('BTCUSDT', makeBookTickerZeroBidAsk('BTCUSDT'));
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps[0].features[13]).toBe(0);
      expect(steps[0].features[14]).toBe(0);
      expect(steps[0].features[15]).toBe(0);
    });
  });

  describe('setTicker24h', () => {
    it('should populate 24h ticker features', () => {
      buffer.setTicker24h('BTCUSDT', makeTicker24h('BTCUSDT'));
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(steps[0].features[19]).toBeCloseTo(0.05, 5);
      expect(typeof steps[0].features[20]).toBe('number');
    });
  });

  describe('setPriceSnapshot', () => {
    it('should use snapshot price when available', () => {
      buffer.setPriceSnapshot({ BTCUSDT: 200 });
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(typeof steps[0].features[22]).toBe('number');
    });

    it('should merge multiple snapshot calls', () => {
      buffer.setPriceSnapshot({ BTCUSDT: 150 });
      buffer.setPriceSnapshot({ ETHUSDT: 200 });
      feedCandles(buffer, 'BTCUSDT', 30);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      expect(typeof steps[0].features[22]).toBe('number');
    });
  });

  describe('addTrades', () => {
    it('should populate trade features when candles exist', () => {
      feedCandles(buffer, 'BTCUSDT', 30);
      buffer.addTrades('BTCUSDT', [makeTrade('BTCUSDT'), makeTrade('BTCUSDT', 'sell')]);

      const steps = buffer.buildMarketSteps('BTCUSDT');

      for (const idx of [16, 17, 18]) {
        expect(typeof steps[0].features[idx]).toBe('number');
      }
    });

    it('should bound trade count by maxSize', () => {
      const buf = new MarketDataBuffer({ maxSize: 5 });
      buf.addTrades(
        'BTCUSDT',
        Array.from({ length: 10 }, (_, _i) => makeTrade('BTCUSDT', 'buy'))
      );

      expect(buf['states'].get(toSymbol('BTCUSDT'))!.trades.length).toBe(5);
    });
  });

  describe('splitTrainValidation', () => {
    it('should split steps 80/20 by default', () => {
      feedCandles(buffer, 'BTCUSDT', 101);
      const steps = buffer.buildMarketSteps('BTCUSDT');
      const splitIdx = Math.floor(steps.length * 0.8);

      const result = buffer.splitTrainValidation(steps, 0.2);

      expect(result.id).toBeTruthy();
      expect(result.train.length).toBe(splitIdx);
      expect(result.validation.length).toBe(steps.length - splitIdx);
    });

    it('should split steps with custom ratio', () => {
      feedCandles(buffer, 'BTCUSDT', 101);
      const steps = buffer.buildMarketSteps('BTCUSDT');
      const splitIdx = Math.floor(steps.length * 0.7);

      const result = buffer.splitTrainValidation(steps, 0.3);

      expect(result.train.length).toBe(splitIdx);
      expect(result.validation.length).toBe(steps.length - splitIdx);
    });

    it('should preserve step order in both splits', () => {
      feedCandles(buffer, 'BTCUSDT', 101);
      const steps = buffer.buildMarketSteps('BTCUSDT');
      const splitIdx = Math.floor(steps.length * 0.8);

      const result = buffer.splitTrainValidation(steps, 0.2);

      expect(result.train[0].timestamp).toBe(steps[0].timestamp);
      expect(result.validation[0].timestamp).toBe(steps[splitIdx].timestamp);
    });
  });

  describe('getAllWindows', () => {
    it('should return null with fewer than 10 steps', () => {
      feedCandles(buffer, 'BTCUSDT', 10);

      const result = buffer.getAllWindows('BTCUSDT');

      expect(result).toBeNull();
    });

    it('should return windows with 11+ candles (10+ steps)', () => {
      feedCandles(buffer, 'BTCUSDT', 11);

      const result = buffer.getAllWindows('BTCUSDT');

      expect(result).not.toBeNull();
      expect(result!.train.length).toBeGreaterThan(0);
      expect(result!.validation.length).toBeGreaterThan(0);
    });

    it('should return null for unknown symbol', () => {
      expect(buffer.getAllWindows('UNKNOWN')).toBeNull();
    });
  });
});

describe('NormalizationStats', () => {
  let norm: NormalizationStats;

  beforeEach(() => {
    norm = new NormalizationStats();
  });

  it('should start with mean and std of zero', () => {
    expect(norm.getMean()).toBe(0);
    expect(norm.getStd()).toBe(0);
  });

  it('should return std=0 with a single value', () => {
    norm.update(42);

    expect(norm.getStd()).toBe(0);
  });

  it('should compute correct running mean', () => {
    norm.update(10);
    norm.update(20);
    norm.update(30);

    expect(norm.getMean()).toBe(20);
  });

  it('should return positive std after 2+ distinct values', () => {
    norm.update(10);
    norm.update(20);

    expect(norm.getStd()).toBeGreaterThan(0);
  });

  it('should return 0 when std is below epsilon', () => {
    norm.update(100);
    norm.update(100);
    norm.update(100);

    expect(norm.normalize(100)).toBe(0);
  });
});
