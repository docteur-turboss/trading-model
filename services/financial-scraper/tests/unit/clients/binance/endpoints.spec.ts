import { describe, it, expect } from '@jest/globals';
import { BINANCE_ENDPOINTS } from '../../../../src/clients/binance/endpoints';

describe('BINANCE_ENDPOINTS', () => {
  describe('depth', () => {
    it('should build order book URL with limit and symbol', () => {
      const url = BINANCE_ENDPOINTS.depth(100, 'BTCUSDT');
      expect(url).toBe('/api/v3/depth?limit=100&symbol=BTCUSDT');
    });

    it('should build order book URL without params', () => {
      const url = BINANCE_ENDPOINTS.depth();
      expect(url).toBe('/api/v3/depth');
    });
  });

  describe('trades', () => {
    it('should build recent trades URL with limit and symbol', () => {
      const url = BINANCE_ENDPOINTS.trades(500, 'ETHUSDT');
      expect(url).toBe('/api/v3/trades?limit=500&symbol=ETHUSDT');
    });

    it('should build recent trades URL without params', () => {
      const url = BINANCE_ENDPOINTS.trades();
      expect(url).toBe('/api/v3/trades');
    });
  });

  describe('historicalTrades', () => {
    it('should build historical trades URL with all params', () => {
      const url = BINANCE_ENDPOINTS.historicalTrades(500, 'BTCUSDT', 12345);
      expect(url).toBe('/api/v3/historicalTrades?limit=500&symbol=BTCUSDT&fromId=12345');
    });

    it('should build historical trades URL without params', () => {
      const url = BINANCE_ENDPOINTS.historicalTrades();
      expect(url).toBe('/api/v3/historicalTrades');
    });
  });

  describe('candlesticks', () => {
    it('should build candlestick URL with all params', () => {
      const url = BINANCE_ENDPOINTS.candlesticks('BTCUSDT', '1m', 1620000000000, 100);
      expect(url).toBe(
        '/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=1620000000000&limit=100'
      );
    });

    it('should build candlestick URL without params', () => {
      const url = BINANCE_ENDPOINTS.candlesticks();
      expect(url).toBe('/api/v3/klines');
    });
  });

  describe('change24hrStats', () => {
    it('should build 24hr stats URL with symbols', () => {
      const url = BINANCE_ENDPOINTS.change24hrStats(['BTCUSDT']);
      expect(url).toContain('/api/v3/ticker/24hr?symbols=');
      expect(url).toContain('BTCUSDT');
    });

    it('should build 24hr stats URL without symbols', () => {
      const url = BINANCE_ENDPOINTS.change24hrStats();
      expect(url).toBe('/api/v3/ticker/24hr');
    });
  });

  describe('compressedAggregateTrades', () => {
    it('should build aggTrades URL with all params', () => {
      const url = BINANCE_ENDPOINTS.compressedAggregateTrades('BTCUSDT', 12345, 100);
      expect(url).toBe('/api/v3/aggTrades?symbol=BTCUSDT&fromId=12345&limit=100');
    });

    it('should build aggTrades URL without params', () => {
      const url = BINANCE_ENDPOINTS.compressedAggregateTrades();
      expect(url).toBe('/api/v3/aggTrades');
    });
  });

  describe('TradingDayTicker', () => {
    it('should build trading day ticker URL with symbols', () => {
      const url = BINANCE_ENDPOINTS.TradingDayTicker(['BTCUSDT', 'ETHUSDT']);
      expect(url).toContain('/api/v3/ticker/tradingDay?symbols=');
      expect(url).toContain('BTCUSDT');
      expect(url).toContain('ETHUSDT');
    });

    it('should build trading day ticker URL without symbols', () => {
      const url = BINANCE_ENDPOINTS.TradingDayTicker();
      expect(url).toBe('/api/v3/ticker/tradingDay');
    });
  });

  describe('symbolPriceTicker', () => {
    it('should build price ticker URL with symbols', () => {
      const url = BINANCE_ENDPOINTS.symbolPriceTicker(['BTCUSDT']);
      expect(url).toContain('/api/v3/ticker/price?symbols=');
    });

    it('should build price ticker URL without symbols', () => {
      const url = BINANCE_ENDPOINTS.symbolPriceTicker();
      expect(url).toBe('/api/v3/ticker/price');
    });
  });

  describe('orderBookTicker', () => {
    it('should build book ticker URL with symbols', () => {
      const url = BINANCE_ENDPOINTS.orderBookTicker(['BTCUSDT']);
      expect(url).toContain('/api/v3/ticker/bookTicker?symbols=');
    });

    it('should build book ticker URL without symbols', () => {
      const url = BINANCE_ENDPOINTS.orderBookTicker();
      expect(url).toBe('/api/v3/ticker/bookTicker');
    });
  });
});
