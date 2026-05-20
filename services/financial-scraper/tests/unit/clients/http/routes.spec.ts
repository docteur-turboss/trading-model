import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockGetTradeBySourceController = jest.fn();
const mockGetTradeBySymbolController = jest.fn();
const mockGetTickerBySourceController = jest.fn();
const mockGetTickerBySymbolController = jest.fn();
const mockGetCandlesBySourceController = jest.fn();
const mockGetCandlesBySymbolController = jest.fn();
const mockGetTradeByTimestampController = jest.fn();
const mockGetOrderBookBySourceController = jest.fn();
const mockGetTickerByTimestampController = jest.fn();
const mockGetOrderBookBySymbolController = jest.fn();
const mockGetCandlesByTimestampController = jest.fn();
const mockGetOrderBookByTimestampAfterController = jest.fn();
const mockGetOrderBookByTimestampBeforeController = jest.fn();

jest.mock('../../../../src/clients/http/controller', () => ({
  GetTradeBySourceController: mockGetTradeBySourceController,
  GetTradeBySymbolController: mockGetTradeBySymbolController,
  GetTickerBySourceController: mockGetTickerBySourceController,
  GetTickerBySymbolController: mockGetTickerBySymbolController,
  GetCandlesBySourceController: mockGetCandlesBySourceController,
  GetCandlesBySymbolController: mockGetCandlesBySymbolController,
  GetTradeByTimestampController: mockGetTradeByTimestampController,
  GetOrderBookBySourceController: mockGetOrderBookBySourceController,
  GetTickerByTimestampController: mockGetTickerByTimestampController,
  GetOrderBookBySymbolController: mockGetOrderBookBySymbolController,
  GetCandlesByTimestampController: mockGetCandlesByTimestampController,
  GetOrderBookByTimestampAfterController: mockGetOrderBookByTimestampAfterController,
  GetOrderBookByTimestampBeforeController: mockGetOrderBookByTimestampBeforeController,
}));

import { FinancialRoutes } from '../../../../src/clients/http/routes';

describe('FinancialRoutes', () => {
  let router: any;
  let routes: Array<{ method: string; path: string; handler: any }>;

  beforeEach(() => {
    jest.clearAllMocks();
    routes = [];

    const mockRouter = {
      get: jest.fn((path: string, handler: any) => {
        routes.push({ method: 'get', path, handler });
        return mockRouter;
      }),
    };

    jest.spyOn(require('express'), 'Router').mockReturnValue(mockRouter);
    router = FinancialRoutes();
  });

  it('should create an Express router', () => {
    expect(router).toBeDefined();
  });

  it('should register all trade routes', () => {
    expect(routes.filter(r => r.path.includes('/trade'))).toHaveLength(3);
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/trade/sources/:source',
        handler: mockGetTradeBySourceController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/trade/symbols/:symbol',
        handler: mockGetTradeBySymbolController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/trade/timestamp/:timestamp',
        handler: mockGetTradeByTimestampController,
      })
    );
  });

  it('should register all ticker routes', () => {
    expect(routes.filter(r => r.path.includes('/ticker'))).toHaveLength(3);
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/ticker/sources/:source',
        handler: mockGetTickerBySourceController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/ticker/symbols/:symbol',
        handler: mockGetTickerBySymbolController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/ticker/timestamp/:timestamp',
        handler: mockGetTickerByTimestampController,
      })
    );
  });

  it('should register all candles routes', () => {
    expect(routes.filter(r => r.path.includes('/candles'))).toHaveLength(3);
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/candles/sources/:source',
        handler: mockGetCandlesBySourceController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/candles/symbols/:symbol',
        handler: mockGetCandlesBySymbolController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/candles/timestamp/:timestamp',
        handler: mockGetCandlesByTimestampController,
      })
    );
  });

  it('should register all orderbook routes', () => {
    const orderBookRoutes = routes.filter(
      r => r.path.includes('/orderbook') || r.path.includes('/heartbeat')
    );
    expect(orderBookRoutes).toHaveLength(4);
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/orderbook/sources/:source',
        handler: mockGetOrderBookBySourceController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/orderbook/symbols/:symbol',
        handler: mockGetOrderBookBySymbolController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/orderbook/after/timestamp/:timestamp',
        handler: mockGetOrderBookByTimestampAfterController,
      })
    );
    expect(routes).toContainEqual(
      expect.objectContaining({
        path: '/heartbeat/before/timestamp/:timestamp',
        handler: mockGetOrderBookByTimestampBeforeController,
      })
    );
  });

  it('should register exactly 13 routes', () => {
    expect(routes).toHaveLength(13);
  });

  it('should only use GET method', () => {
    routes.forEach(r => expect(r.method).toBe('get'));
  });
});
