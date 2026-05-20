import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockExecuteInsert = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockExecuteSelectMany = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.mock('../../../../../src/config/db', () => {
  const mockSelectQuery = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    executeSelectMany: mockExecuteSelectMany,
  };

  const mockInsertQuery = {
    values: jest.fn().mockReturnThis(),
    executeInsert: mockExecuteInsert,
  };

  return {
    DBConnection: jest.fn(() => ({
      insertInto: jest.fn(() => mockInsertQuery),
      selectFrom: jest.fn(() => mockSelectQuery),
    })),
  };
});

import {
  insertCandles,
  selectCandlesBy,
} from '../../../../../src/infra/market-data/schema/candles-schema';

const makeCandle = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  market: 'crypto',
  source: 'binance',
  interval: '1m',
  low: 50000,
  open: 50100,
  high: 50200,
  close: 50150,
  volume: 100.5,
  trades: 1000,
  timestamp: 1704067200000,
  closeTimestamp: 1704067260000,
  ...overrides,
});

describe('candles-schema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertCandles', () => {
    it('should insert candle data successfully', async () => {
      const data: never[] = [makeCandle() as never];
      await insertCandles(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });

    it('should do nothing when data array is empty', async () => {
      const data: never[] = [];
      await insertCandles(data);
      expect(mockExecuteInsert).not.toHaveBeenCalled();
    });

    it('should insert multiple candles', async () => {
      const data: never[] = [
        makeCandle({ symbol: 'BTCUSDT' }) as never,
        makeCandle({ symbol: 'ETHUSDT' }) as never,
      ];
      await insertCandles(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });

    it('should do nothing when first argument is empty array and undefined trades', async () => {
      const data: never[] = [];
      await insertCandles(data);
      expect(mockExecuteInsert).not.toHaveBeenCalled();
    });

    it('should handle null trades field', async () => {
      const data: never[] = [makeCandle({ trades: null }) as never];
      await insertCandles(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });
  });

  describe('selectCandlesBy', () => {
    it('should select candles by symbol', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeCandle()] as never[]);
      const results = await selectCandlesBy.symbol('BTCUSDT');
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select candles by source', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeCandle()] as never[]);
      const results = await selectCandlesBy.source('binance');
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select candles by timestamp after', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeCandle()] as never[]);
      const results = await selectCandlesBy.timestamp.after(new Date('2024-01-01'));
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select candles by timestamp before', async () => {
      mockExecuteSelectMany.mockResolvedValue([] as never[]);
      const results = await selectCandlesBy.timestamp.before(new Date('2024-01-02'));
      expect(results).toHaveLength(0);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should return empty array when no candles found', async () => {
      mockExecuteSelectMany.mockResolvedValue([] as never[]);
      const results = await selectCandlesBy.symbol('UNKNOWN');
      expect(results).toEqual([]);
    });
  });
});
