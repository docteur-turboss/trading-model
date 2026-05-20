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
  insertTicker,
  selectTickerBy,
} from '../../../../../src/infra/market-data/schema/ticker24h.schema';

const makeTicker = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  market: 'crypto',
  source: 'binance',
  low: 49000,
  high: 51000,
  last: 50500,
  open: 50000,
  volume: 5000.5,
  timestamp: 1704067200000,
  closeTimestamp: 1704153599000,
  ...overrides,
});

describe('ticker24h-schema', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertTicker', () => {
    it('should insert ticker data successfully', async () => {
      const data: never[] = [makeTicker() as never];
      await insertTicker(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });

    it('should do nothing when data array is empty', async () => {
      const data: never[] = [];
      await insertTicker(data);
      expect(mockExecuteInsert).not.toHaveBeenCalled();
    });

    it('should insert multiple tickers', async () => {
      const data: never[] = [
        makeTicker({ symbol: 'BTCUSDT' }) as never,
        makeTicker({ symbol: 'ETHUSDT' }) as never,
      ];
      await insertTicker(data);
      expect(mockExecuteInsert).toHaveBeenCalled();
    });
  });

  describe('selectTickerBy', () => {
    it('should select ticker by symbol', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeTicker()] as never[]);
      const results = await selectTickerBy.symbol('BTCUSDT');
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select ticker by source', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeTicker()] as never[]);
      const results = await selectTickerBy.source('binance');
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should select ticker by timestamp', async () => {
      mockExecuteSelectMany.mockResolvedValue([makeTicker()] as never[]);
      const results = await selectTickerBy.timestamp(new Date('2024-01-01'));
      expect(results).toHaveLength(1);
      expect(mockExecuteSelectMany).toHaveBeenCalled();
    });

    it('should return empty array when no ticker found', async () => {
      mockExecuteSelectMany.mockResolvedValue([] as never[]);
      const results = await selectTickerBy.symbol('UNKNOWN');
      expect(results).toEqual([]);
    });
  });
});
