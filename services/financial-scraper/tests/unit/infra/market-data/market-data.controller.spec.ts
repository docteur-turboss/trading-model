import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../../src/infra/market-data/market-data.model', () => ({
  MarketDataModel: {
    insertCandles: jest.fn<any>(),
    insertTrades: jest.fn<any>(),
    insertOrderBook: jest.fn<any>(),
    insertTicker: jest.fn<any>(),
  },
}));

import { MarketDataController } from '../../../../src/infra/market-data/market-data.controller';
import { MarketDataModel } from '../../../../src/infra/market-data/market-data.model';

const mockModel = jest.mocked(MarketDataModel);

describe('MarketDataController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should persist candles when payload has candles', async () => {
    const payload: any = {
      candles: [{ symbol: 'BTCUSDT', interval: '1m' }],
      recentTrades: [],
      orderBook: undefined,
      ticker24h: [],
      fetchedAt: Date.now(),
    };

    await MarketDataController.persist(payload);

    expect(mockModel.insertCandles).toHaveBeenCalledTimes(1);
    expect(mockModel.insertTrades).not.toHaveBeenCalled();
    expect(mockModel.insertOrderBook).not.toHaveBeenCalled();
    expect(mockModel.insertTicker).not.toHaveBeenCalled();
  });

  it('should persist trades when payload has recentTrades', async () => {
    const payload: any = {
      candles: [],
      recentTrades: [{ tradeId: 1n }],
      orderBook: undefined,
      ticker24h: [],
      fetchedAt: Date.now(),
    };

    await MarketDataController.persist(payload);

    expect(mockModel.insertTrades).toHaveBeenCalledTimes(1);
    expect(mockModel.insertCandles).not.toHaveBeenCalled();
    expect(mockModel.insertOrderBook).not.toHaveBeenCalled();
    expect(mockModel.insertTicker).not.toHaveBeenCalled();
  });

  it('should persist orderBook when payload has orderBook', async () => {
    const payload: any = {
      candles: [],
      recentTrades: [],
      orderBook: { symbol: 'BTCUSDT' },
      ticker24h: [],
      fetchedAt: Date.now(),
    };

    await MarketDataController.persist(payload);

    expect(mockModel.insertOrderBook).toHaveBeenCalledTimes(1);
    expect(mockModel.insertCandles).not.toHaveBeenCalled();
    expect(mockModel.insertTrades).not.toHaveBeenCalled();
    expect(mockModel.insertTicker).not.toHaveBeenCalled();
  });

  it('should persist ticker24h when payload has ticker24h', async () => {
    const payload: any = {
      candles: [],
      recentTrades: [],
      orderBook: undefined,
      ticker24h: [{ symbol: 'BTCUSDT' }],
      fetchedAt: Date.now(),
    };

    await MarketDataController.persist(payload);

    expect(mockModel.insertTicker).toHaveBeenCalledTimes(1);
    expect(mockModel.insertCandles).not.toHaveBeenCalled();
    expect(mockModel.insertTrades).not.toHaveBeenCalled();
    expect(mockModel.insertOrderBook).not.toHaveBeenCalled();
  });

  it('should persist all data types when payload has everything', async () => {
    const payload: any = {
      candles: [{ symbol: 'BTCUSDT', interval: '1m' }],
      recentTrades: [{ tradeId: 1n }],
      orderBook: { symbol: 'BTCUSDT' },
      ticker24h: [{ symbol: 'BTCUSDT' }],
      fetchedAt: Date.now(),
    };

    await MarketDataController.persist(payload);

    expect(mockModel.insertCandles).toHaveBeenCalledTimes(1);
    expect(mockModel.insertTrades).toHaveBeenCalledTimes(1);
    expect(mockModel.insertOrderBook).toHaveBeenCalledTimes(1);
    expect(mockModel.insertTicker).toHaveBeenCalledTimes(1);
  });

  it('should do nothing when payload has no data', async () => {
    const payload: any = {
      candles: [],
      recentTrades: [],
      orderBook: undefined,
      ticker24h: undefined,
      fetchedAt: Date.now(),
    };

    await MarketDataController.persist(payload);

    expect(mockModel.insertCandles).not.toHaveBeenCalled();
    expect(mockModel.insertTrades).not.toHaveBeenCalled();
    expect(mockModel.insertOrderBook).not.toHaveBeenCalled();
    expect(mockModel.insertTicker).not.toHaveBeenCalled();
  });

  it('should propagate error when candle insertion throws', async () => {
    mockModel.insertCandles.mockRejectedValue(new Error('DB error'));
    mockModel.insertTrades.mockResolvedValue(undefined);
    mockModel.insertOrderBook.mockResolvedValue(undefined);
    mockModel.insertTicker.mockResolvedValue(undefined);

    const payload: any = {
      candles: [{ symbol: 'BTCUSDT', interval: '1m' }],
      recentTrades: [{ tradeId: 1n }],
      orderBook: { symbol: 'BTCUSDT' },
      ticker24h: [{ symbol: 'BTCUSDT' }],
      fetchedAt: Date.now(),
    };

    await expect(MarketDataController.persist(payload)).rejects.toThrow('DB error');
  });
});
