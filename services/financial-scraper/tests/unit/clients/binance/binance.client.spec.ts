import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../../src/config/http', () => ({
  httpClients: {
    binance: {
      get: jest.fn<(...args: any[]) => any>(),
    },
  },
}));

jest.mock('../../../../src/clients/binance/endpoints', () => ({
  BINANCE_ENDPOINTS: {
    depth: jest.fn(() => '/api/v3/depth'),
    trades: jest.fn(() => '/api/v3/trades'),
    historicalTrades: jest.fn(() => '/api/v3/historicalTrades'),
    compressedAggregateTrades: jest.fn(() => '/api/v3/aggTrades'),
    candlesticks: jest.fn(() => '/api/v3/klines'),
    change24hrStats: jest.fn(() => '/api/v3/ticker/24hr'),
    TradingDayTicker: jest.fn(() => '/api/v3/ticker/tradingDay'),
    symbolPriceTicker: jest.fn(() => '/api/v3/ticker/price'),
    orderBookTicker: jest.fn(() => '/api/v3/ticker/bookTicker'),
  },
}));

jest.mock('../../../../src/clients/binance/weights', () => ({
  BINANCE_WEIGHTS: {
    depth: jest.fn(() => 5),
    trades: jest.fn(() => 25),
    historicalTrades: jest.fn(() => 25),
    compressedAggregateTrades: jest.fn(() => 4),
    candlesticks: jest.fn(() => 2),
    change24hrStats: jest.fn(() => 2),
    tradingDayTicker: jest.fn(() => 4),
    symbolPriceTicker: jest.fn(() => 4),
    orderBookTicker: jest.fn(() => 4),
  },
}));

import { httpClients } from '../../../../src/config/http';
import {
  getOrderBook,
  getRecentTrades,
  getHistoricalTrades,
  getCandlestickData,
  getCompressedAggregateTrades,
  get24hrTickerStats,
  getTradingDayTicker,
  getSymbolPriceTicker,
  getOrderBookTicker,
} from '../../../../src/clients/binance/binance.client';

const mockGet = jest.mocked(httpClients.binance.get);

describe('BinanceClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: {} });
  });

  it('getOrderBook should call depth endpoint with weight', async () => {
    await getOrderBook('BTCUSDT', 100);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/depth', { weight: 5 } as never);
  });

  it('getOrderBook should use default limit', async () => {
    await getOrderBook('BTCUSDT');
    expect(mockGet).toHaveBeenCalledWith('/api/v3/depth', { weight: 5 } as never);
  });

  it('getRecentTrades should call trades endpoint with weight', async () => {
    await getRecentTrades('BTCUSDT', 100);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/trades', { weight: 25 } as never);
  });

  it('getRecentTrades should use default limit', async () => {
    await getRecentTrades('BTCUSDT');
    expect(mockGet).toHaveBeenCalledWith('/api/v3/trades', { weight: 25 } as never);
  });

  it('getHistoricalTrades should call historicalTrades endpoint with weight', async () => {
    await getHistoricalTrades('BTCUSDT', 100, 12345);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/historicalTrades', { weight: 25 } as never);
  });

  it('getHistoricalTrades should use default limit', async () => {
    await getHistoricalTrades('BTCUSDT', undefined, 12345);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/historicalTrades', { weight: 25 } as never);
  });

  it('getCandlestickData should call candlesticks endpoint with weight', async () => {
    await getCandlestickData('BTCUSDT', 100, '1m', 1620000000000);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/klines', { weight: 2 } as never);
  });

  it('getCandlestickData should use default limit', async () => {
    await getCandlestickData('BTCUSDT', undefined, '1m', 1620000000000);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/klines', { weight: 2 } as never);
  });

  it('getCompressedAggregateTrades should call aggTrades endpoint with weight', async () => {
    await getCompressedAggregateTrades('BTCUSDT', 12345, 100);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/aggTrades', { weight: 4 } as never);
  });

  it('getCompressedAggregateTrades should use default limit', async () => {
    await getCompressedAggregateTrades('BTCUSDT', 12345);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/aggTrades', { weight: 4 } as never);
  });

  it('getTradingDayTicker should call tradingDay endpoint with weight', async () => {
    await getTradingDayTicker(['BTCUSDT']);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/tradingDay', { weight: 4 } as never);
  });

  it('get24hrTickerStats should call 24hr endpoint with weight', async () => {
    await get24hrTickerStats(['BTCUSDT']);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/24hr', { weight: 2 } as never);
  });

  it('get24hrTickerStats should handle undefined symbol', async () => {
    await get24hrTickerStats();
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/24hr', { weight: 2 } as never);
  });

  it('getSymbolPriceTicker should call price endpoint with weight', async () => {
    await getSymbolPriceTicker(['BTCUSDT']);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/price', { weight: 4 } as never);
  });

  it('getSymbolPriceTicker should handle undefined symbol', async () => {
    await getSymbolPriceTicker();
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/price', { weight: 4 } as never);
  });

  it('getOrderBookTicker should call bookTicker endpoint with weight', async () => {
    await getOrderBookTicker(['BTCUSDT']);
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/bookTicker', { weight: 4 } as never);
  });

  it('getOrderBookTicker should handle undefined symbol', async () => {
    await getOrderBookTicker();
    expect(mockGet).toHaveBeenCalledWith('/api/v3/ticker/bookTicker', { weight: 4 } as never);
  });

  describe('symbol validation', () => {
    it('getOrderBook throws on empty symbol', async () => {
      await expect(getOrderBook('')).rejects.toThrow(
        'getOrderBook: symbol must be a non-empty string'
      );
    });

    it('getOrderBook throws on blank symbol', async () => {
      await expect(getOrderBook('   ')).rejects.toThrow(
        'getOrderBook: symbol must be a non-empty string'
      );
    });

    it('getRecentTrades throws on empty symbol', async () => {
      await expect(getRecentTrades('')).rejects.toThrow(
        'getRecentTrades: symbol must be a non-empty string'
      );
    });

    it('getHistoricalTrades throws on empty symbol', async () => {
      await expect(getHistoricalTrades('', 500, 1)).rejects.toThrow(
        'getHistoricalTrades: symbol must be a non-empty string'
      );
    });

    it('getCandlestickData throws on empty symbol', async () => {
      await expect(getCandlestickData('', 100, '1m')).rejects.toThrow(
        'getCandlestickData: symbol must be a non-empty string'
      );
    });

    it('getCompressedAggregateTrades throws on empty symbol', async () => {
      await expect(getCompressedAggregateTrades('', 1)).rejects.toThrow(
        'getCompressedAggregateTrades: symbol must be a non-empty string'
      );
    });

    it('getTradingDayTicker throws on empty symbol in array', async () => {
      await expect(getTradingDayTicker([''])).rejects.toThrow(
        'getTradingDayTicker: symbol must be a non-empty string'
      );
    });

    it('get24hrTickerStats throws on empty symbol in array', async () => {
      await expect(get24hrTickerStats([''])).rejects.toThrow(
        'get24hrTickerStats: symbol must be a non-empty string'
      );
    });

    it('getSymbolPriceTicker throws on empty symbol in array', async () => {
      await expect(getSymbolPriceTicker([''])).rejects.toThrow(
        'getSymbolPriceTicker: symbol must be a non-empty string'
      );
    });

    it('getOrderBookTicker throws on empty symbol in array', async () => {
      await expect(getOrderBookTicker([''])).rejects.toThrow(
        'getOrderBookTicker: symbol must be a non-empty string'
      );
    });
  });
});
