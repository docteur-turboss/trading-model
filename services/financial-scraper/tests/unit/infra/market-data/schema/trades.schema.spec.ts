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
  insertTrades,
  selectTradesBy,
} from '../../../../../src/infra/market-data/schema/trades.schema';

const makeTrade = (overrides: Record<string, unknown> = {}) => ({
  side: 'buy' as const,
  price: 50000,
  market: 'crypto',
  source: 'binance',
  symbol: 'BTCUSDT',
  tradeId: 123456789n,
  quantity: 0.5,
  timestamp: 1704067200000,
  ...overrides,
});

describe('trades-schema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertTrades', () => {
    it('should insert trade data successfully', async () => {
      const data: never[] = [makeTrade() as never];
      await insertTrades(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });

    it('should do nothing when data array is empty', async () => {
      const data: never[] = [];
      await insertTrades(data);
      expect(mockExecuteInsert).not.toHaveBeenCalled();
    });

    it('should insert multiple trades', async () => {
      const data: never[] = [
        makeTrade({ tradeId: 1n }) as never,
        makeTrade({ tradeId: 2n }) as never,
      ];
      await insertTrades(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });
  });

  describe('selectTradesBy', () => {
    it('should select trades by symbol', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeTrade()] as never[]);
      const results = await selectTradesBy.symbol('BTCUSDT');
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select trades by source', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeTrade()] as never[]);
      const results = await selectTradesBy.source('binance');
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select trades by timestamp', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeTrade()] as never[]);
      const results = await selectTradesBy.timestamp(new Date('2024-01-01'));
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should return empty array when no trades found', async () => {
      mockExecuteSelectMany.mockResolvedValue([] as never[]);
      const results = await selectTradesBy.symbol('UNKNOWN');
      expect(results).toEqual([]);
    });
  });
});
