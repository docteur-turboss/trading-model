import { describe, it, expect } from '@jest/globals';
import { BINANCE_WEIGHTS } from '../../../../src/clients/binance/weights';

describe('BINANCE_WEIGHTS', () => {
  describe('depth', () => {
    it('should return 5 for limit <= 100', () => {
      expect(BINANCE_WEIGHTS.depth(1)).toBe(5);
      expect(BINANCE_WEIGHTS.depth(100)).toBe(5);
    });

    it('should return 25 for limit 101-500', () => {
      expect(BINANCE_WEIGHTS.depth(101)).toBe(25);
      expect(BINANCE_WEIGHTS.depth(500)).toBe(25);
    });

    it('should return 50 for limit 501-1000', () => {
      expect(BINANCE_WEIGHTS.depth(501)).toBe(50);
      expect(BINANCE_WEIGHTS.depth(1000)).toBe(50);
    });

    it('should return 250 for limit > 1000', () => {
      expect(BINANCE_WEIGHTS.depth(1001)).toBe(250);
      expect(BINANCE_WEIGHTS.depth(5000)).toBe(250);
    });

    it('should use default limit of 100 when not provided', () => {
      expect(BINANCE_WEIGHTS.depth()).toBe(5);
    });
  });

  describe('trades', () => {
    it('should return 25', () => {
      expect(BINANCE_WEIGHTS.trades()).toBe(25);
    });
  });

  describe('historicalTrades', () => {
    it('should return 25', () => {
      expect(BINANCE_WEIGHTS.historicalTrades()).toBe(25);
    });
  });

  describe('compressedAggregateTrades', () => {
    it('should return 4', () => {
      expect(BINANCE_WEIGHTS.compressedAggregateTrades()).toBe(4);
    });
  });

  describe('candlesticks', () => {
    it('should return 2', () => {
      expect(BINANCE_WEIGHTS.candlesticks()).toBe(2);
    });
  });

  describe('change24hrStats', () => {
    it('should return 2 for 1-20 symbols', () => {
      expect(BINANCE_WEIGHTS.change24hrStats(1)).toBe(2);
      expect(BINANCE_WEIGHTS.change24hrStats(20)).toBe(2);
    });

    it('should return 40 for 21-100 symbols', () => {
      expect(BINANCE_WEIGHTS.change24hrStats(21)).toBe(40);
      expect(BINANCE_WEIGHTS.change24hrStats(100)).toBe(40);
    });

    it('should return 80 for > 100 symbols', () => {
      expect(BINANCE_WEIGHTS.change24hrStats(101)).toBe(80);
    });
  });

  describe('tradingDayTicker', () => {
    it('should return 4 * symbolCount for 1-49 symbols', () => {
      expect(BINANCE_WEIGHTS.tradingDayTicker(1)).toBe(4);
      expect(BINANCE_WEIGHTS.tradingDayTicker(49)).toBe(196);
    });

    it('should return 200 for 50-100 symbols', () => {
      expect(BINANCE_WEIGHTS.tradingDayTicker(50)).toBe(200);
      expect(BINANCE_WEIGHTS.tradingDayTicker(100)).toBe(200);
    });

    it('should throw for > 100 symbols', () => {
      expect(() => BINANCE_WEIGHTS.tradingDayTicker(101)).toThrow('maximum of 100');
    });
  });

  describe('symbolPriceTicker', () => {
    it('should return 4 for any symbol count', () => {
      expect(BINANCE_WEIGHTS.symbolPriceTicker(1)).toBe(4);
      expect(BINANCE_WEIGHTS.symbolPriceTicker(100)).toBe(4);
    });
  });

  describe('orderBookTicker', () => {
    it('should return 4 for any symbol count', () => {
      expect(BINANCE_WEIGHTS.orderBookTicker(1)).toBe(4);
      expect(BINANCE_WEIGHTS.orderBookTicker(100)).toBe(4);
    });
  });
});
