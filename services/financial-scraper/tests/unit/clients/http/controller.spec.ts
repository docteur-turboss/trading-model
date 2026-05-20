import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: Function) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => ({
  ResponseException: (reason: string) => ({
    BadRequest: () => {
      throw { status: 400, data: reason };
    },
    Success: () => {
      throw { status: 200, data: reason };
    },
    NotFound: () => {
      throw { status: 404, data: reason };
    },
  }),
}));

const mockSelectTradesBy = {
  symbol: jest.fn<any>(),
  timestamp: jest.fn<any>(),
  source: jest.fn<any>(),
};

const mockSelectTickerBy = {
  symbol: jest.fn<any>(),
  timestamp: jest.fn<any>(),
  source: jest.fn<any>(),
};

const mockSelectOrderBookBy = {
  symbol: jest.fn<any>(),
  source: jest.fn<any>(),
  timestamp: {
    after: jest.fn<any>(),
    before: jest.fn<any>(),
  },
};

const mockSelectCandlesBy = {
  symbol: jest.fn<any>(),
  source: jest.fn<any>(),
  timestamp: {
    after: jest.fn<any>(),
  },
};

jest.mock('infra/market-data/schema/trades.schema', () => ({
  selectTradesBy: mockSelectTradesBy,
}));

jest.mock('infra/market-data/schema/ticker24h.schema', () => ({
  selectTickerBy: mockSelectTickerBy,
}));

jest.mock('infra/market-data/schema/order-book.schema', () => ({
  selectOrderBookBy: mockSelectOrderBookBy,
}));

jest.mock('infra/market-data/schema/candles-schema', () => ({
  selectCandlesBy: mockSelectCandlesBy,
}));

import {
  GetTradeBySymbolController,
  GetTradeByTimestampController,
  GetTradeBySourceController,
  GetTickerBySymbolController,
  GetTickerByTimestampController,
  GetTickerBySourceController,
  GetOrderBookBySymbolController,
  GetOrderBookByTimestampAfterController,
  GetOrderBookByTimestampBeforeController,
  GetOrderBookBySourceController,
  GetCandlesBySymbolController,
  GetCandlesByTimestampController,
  GetCandlesBySourceController,
} from '../../../../src/clients/http/controller';

const expectRejects = async (fn: Function): Promise<any> => {
  try {
    await fn();
    return { threw: false };
  } catch (e: any) {
    return { threw: true, value: e };
  }
};

describe('HTTP Controllers', () => {
  const mockReq = (params: Record<string, any>) => ({ params }) as any;
  const mockRes = {} as any;
  const mockNext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Trade controllers', () => {
    beforeEach(() => {
      mockSelectTradesBy.symbol.mockResolvedValue([{ tradeId: 1 }]);
      mockSelectTradesBy.timestamp.mockResolvedValue([{ tradeId: 2 }]);
      mockSelectTradesBy.source.mockResolvedValue([{ tradeId: 3 }]);
    });

    it('GetTradeBySymbolController should call selectTradesBy.symbol with valid symbol', async () => {
      const result = await expectRejects(() =>
        GetTradeBySymbolController(mockReq({ symbol: 'BTCUSDT' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectTradesBy.symbol).toHaveBeenCalledWith('BTCUSDT');
    });

    it('GetTradeBySymbolController should throw BadRequest with missing symbol', async () => {
      const result = await expectRejects(() =>
        GetTradeBySymbolController(mockReq({}), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(result.value).toMatchObject({ status: 400 });
    });

    it('GetTradeByTimestampController should call selectTradesBy.timestamp with valid date', async () => {
      const result = await expectRejects(() =>
        GetTradeByTimestampController(mockReq({ timestamp: '2024-01-01' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectTradesBy.timestamp).toHaveBeenCalled();
    });

    it('GetTradeByTimestampController should throw BadRequest with invalid timestamp', async () => {
      const result = await expectRejects(() =>
        GetTradeByTimestampController(mockReq({ timestamp: '' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(result.value).toMatchObject({ status: 400 });
    });

    it('GetTradeBySourceController should call selectTradesBy.source with valid source', async () => {
      const result = await expectRejects(() =>
        GetTradeBySourceController(mockReq({ source: 'binance' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectTradesBy.source).toHaveBeenCalledWith('binance');
    });

    it('GetTradeBySourceController should throw BadRequest with missing source', async () => {
      const result = await expectRejects(() =>
        GetTradeBySourceController(mockReq({}), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(result.value).toMatchObject({ status: 400 });
    });

    it('should throw NotFound when fetcher returns no result', async () => {
      mockSelectTradesBy.symbol.mockRejectedValue(new Error('No result returned'));
      const result = await expectRejects(() =>
        GetTradeBySymbolController(mockReq({ symbol: 'UNKNOWN' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(result.value).toMatchObject({ status: 404 });
    });

    it('should rethrow unexpected errors from fetcher', async () => {
      mockSelectTradesBy.symbol.mockRejectedValue(new Error('Database connection failed'));
      const result = await expectRejects(() =>
        GetTradeBySymbolController(mockReq({ symbol: 'BTCUSDT' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(result.value.message).toBe('Database connection failed');
    });
  });

  describe('Ticker controllers', () => {
    beforeEach(() => {
      mockSelectTickerBy.symbol.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectTickerBy.timestamp.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectTickerBy.source.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
    });

    it('GetTickerBySymbolController should call selectTickerBy.symbol', async () => {
      const result = await expectRejects(() =>
        GetTickerBySymbolController(mockReq({ symbol: 'BTCUSDT' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectTickerBy.symbol).toHaveBeenCalledWith('BTCUSDT');
    });

    it('GetTickerByTimestampController should call selectTickerBy.timestamp', async () => {
      const result = await expectRejects(() =>
        GetTickerByTimestampController(mockReq({ timestamp: '2024-01-01' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectTickerBy.timestamp).toHaveBeenCalled();
    });

    it('GetTickerBySourceController should call selectTickerBy.source', async () => {
      const result = await expectRejects(() =>
        GetTickerBySourceController(mockReq({ source: 'binance' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectTickerBy.source).toHaveBeenCalledWith('binance');
    });
  });

  describe('OrderBook controllers', () => {
    beforeEach(() => {
      mockSelectOrderBookBy.symbol.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectOrderBookBy.source.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectOrderBookBy.timestamp.after.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectOrderBookBy.timestamp.before.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
    });

    it('GetOrderBookBySymbolController should call selectOrderBookBy.symbol', async () => {
      const result = await expectRejects(() =>
        GetOrderBookBySymbolController(mockReq({ symbol: 'BTCUSDT' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectOrderBookBy.symbol).toHaveBeenCalledWith('BTCUSDT');
    });

    it('GetOrderBookByTimestampAfterController should call selectOrderBookBy.timestamp.after', async () => {
      const result = await expectRejects(() =>
        GetOrderBookByTimestampAfterController(mockReq({ timestamp: '1000' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectOrderBookBy.timestamp.after).toHaveBeenCalledWith(1000);
    });

    it('GetOrderBookByTimestampBeforeController should call selectOrderBookBy.timestamp.before', async () => {
      const result = await expectRejects(() =>
        GetOrderBookByTimestampBeforeController(mockReq({ timestamp: '9999' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectOrderBookBy.timestamp.before).toHaveBeenCalledWith(9999);
    });

    it('GetOrderBookBySourceController should call selectOrderBookBy.source', async () => {
      const result = await expectRejects(() =>
        GetOrderBookBySourceController(mockReq({ source: 'binance' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectOrderBookBy.source).toHaveBeenCalledWith('binance');
    });

    it('should throw BadRequest for invalid order book timestamp', async () => {
      const result = await expectRejects(() =>
        GetOrderBookByTimestampAfterController(
          mockReq({ timestamp: 'not-a-number' }),
          mockRes,
          mockNext
        )
      );
      expect(result.threw).toBe(true);
      expect(result.value).toMatchObject({ status: 400 });
    });
  });

  describe('Candles controllers', () => {
    beforeEach(() => {
      mockSelectCandlesBy.symbol.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectCandlesBy.source.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
      mockSelectCandlesBy.timestamp.after.mockResolvedValue([{ symbol: 'BTCUSDT' }]);
    });

    it('GetCandlesBySymbolController should call selectCandlesBy.symbol', async () => {
      const result = await expectRejects(() =>
        GetCandlesBySymbolController(mockReq({ symbol: 'BTCUSDT' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectCandlesBy.symbol).toHaveBeenCalledWith('BTCUSDT');
    });

    it('GetCandlesByTimestampController should call selectCandlesBy.timestamp.after', async () => {
      const result = await expectRejects(() =>
        GetCandlesByTimestampController(mockReq({ timestamp: '2024-01-01' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectCandlesBy.timestamp.after).toHaveBeenCalled();
    });

    it('GetCandlesBySourceController should call selectCandlesBy.source', async () => {
      const result = await expectRejects(() =>
        GetCandlesBySourceController(mockReq({ source: 'binance' }), mockRes, mockNext)
      );
      expect(result.threw).toBe(true);
      expect(mockSelectCandlesBy.source).toHaveBeenCalledWith('binance');
    });
  });
});
