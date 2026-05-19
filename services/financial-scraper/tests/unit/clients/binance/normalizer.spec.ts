import { describe, it, expect } from '@jest/globals';
import { BinanceNormalizer } from '../../../../src/clients/binance/normalizer';
import {
  mockDepthResponse,
  mockTradeResponse,
  mockHistoricalTradeResponse,
  mockAggregateTradeResponse,
  mockCandlestickResponse,
  mock24hrTickerResponse,
  mockTradingDayTickerResponse,
  mockPriceTickerResponse,
  mockBookTickerResponse,
} from '../../../fixtures/binance.fixture';

describe('BinanceNormalizer', () => {
  describe('orderBook', () => {
    it('should normalize depth response to OrderBookEntity', () => {
      const result = BinanceNormalizer.orderBook('BTCUSDT', mockDepthResponse);
      expect(result.symbol).toBe('BTCUSDT');
      expect(result.source).toBe('binance');
      expect(result.market).toBe('crypto');
      expect(result.bids.size).toBe(2);
      expect(result.asks.size).toBe(2);
      expect(typeof result.timestamp).toBe('number');
    });

    it('should parse bid/ask prices as numbers', () => {
      const result = BinanceNormalizer.orderBook('BTCUSDT', mockDepthResponse);
      const firstBid = [...result.bids][0];
      expect(typeof firstBid.price).toBe('number');
      expect(typeof firstBid.quantity).toBe('number');
    });
  });

  describe('trades', () => {
    it('should normalize trade response to TradeEntity array', () => {
      const result = BinanceNormalizer.trades('BTCUSDT', mockTradeResponse);
      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[0].side).toBe('sell'); // isBuyerMaker = true → sell
      expect(result[1].side).toBe('buy');
    });

    it('should handle historical trade response', () => {
      const result = BinanceNormalizer.trades('BTCUSDT', mockHistoricalTradeResponse);
      expect(result).toHaveLength(1);
    });

    it('should convert string price and quantity to numbers', () => {
      const result = BinanceNormalizer.trades('BTCUSDT', mockTradeResponse);
      expect(typeof result[0].price).toBe('number');
      expect(typeof result[0].quantity).toBe('number');
    });
  });

  describe('aggregateTrades', () => {
    it('should normalize aggregate trade response', () => {
      const result = BinanceNormalizer.aggregateTrades('BTCUSDT', mockAggregateTradeResponse);
      expect(result).toHaveLength(1);
      expect(result[0].tradeId).toBe(BigInt(28457));
      expect(result[0].side).toBe('sell'); // m = true → sell
    });
  });

  describe('candles', () => {
    it('should normalize candlestick response to CandleEntity array', () => {
      const result = BinanceNormalizer.candles('BTCUSDT', '1m', mockCandlestickResponse);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[0].interval).toBe('1m');
      expect(result[0].open).toBe(0.0163479);
      expect(result[0].high).toBe(0.8);
      expect(result[0].low).toBe(0.015758);
      expect(result[0].close).toBe(0.015771);
      expect(result[0].volume).toBe(148976.11427815);
      expect(result[0].closeTimestamp).toBe(1499644799999);
      expect(result[0].trades).toBe(308);
      expect(result[0].timestamp).toBe(1499040000000);
    });
  });

  describe('ticker24h', () => {
    it('should normalize 24hr ticker response to TickerEntity array', () => {
      const result = BinanceNormalizer.ticker24h(mock24hrTickerResponse);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[0].open).toBe(99);
      expect(result[0].high).toBe(100);
      expect(result[0].low).toBe(0.1);
      expect(result[0].last).toBe(4.000002);
      expect(result[0].volume).toBe(8913.3);
    });
  });

  describe('tradingDayTicker', () => {
    it('should normalize trading day ticker response', () => {
      const result = BinanceNormalizer.tradingDayTicker(mockTradingDayTickerResponse);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('BTCUSDT');
    });
  });

  describe('priceTicker', () => {
    it('should normalize price ticker to Record<string, number>', () => {
      const result = BinanceNormalizer.priceTicker(mockPriceTickerResponse);
      expect(result).toEqual({ BTCUSDT: 50000 });
    });
  });

  describe('bookTicker', () => {
    it('should normalize book ticker response', () => {
      const result = BinanceNormalizer.bookTicker(mockBookTickerResponse);
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('BTCUSDT');
      expect(result[0].bid).toBe(49990);
      expect(result[0].ask).toBe(50010);
    });
  });
});
