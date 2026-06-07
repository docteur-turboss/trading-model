import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('os', () => ({
  cpus: jest.fn(() => Array(4).fill({})),
}));

const mockCronSchedule = jest.fn<any>();
jest.mock('node-cron', () => ({
  schedule: mockCronSchedule,
}));

const mockLimit = jest.fn((fn: Function) => fn());
jest.mock('p-limit', () => {
  const pLimit = jest.fn(() => mockLimit);
  return pLimit;
});

jest.mock('@trading-model/common/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockWorkerRun = jest.fn<any>();
jest.mock('../../../../src/job/worker/binance.worker', () => ({
  BinanceWorker: jest.fn(() => ({
    run: mockWorkerRun,
  })),
}));

jest.mock('../../../../src/infra/market-data/market-data.controller', () => ({
  MarketDataController: {
    persist: jest.fn<any>(),
  },
}));

import { BinanceCronOrchestrator } from '../../../../src/job/cron/binance.cron';
import { logger } from '@trading-model/common/config/logger';
import { MarketDataController } from '../../../../src/infra/market-data/market-data.controller';

const mockLogger = jest.mocked(logger);
const mockPersist = jest.mocked(MarketDataController.persist);

const getCronHandler = (): Function => mockCronSchedule.mock.calls[0][1] as Function;

describe('BinanceCronOrchestrator', () => {
  const defaultConfig = {
    schedule: '*/1 * * * *',
    symbols: ['BTCUSDT', 'ETHUSDT'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkerRun.mockResolvedValue({ fetchedAt: Date.now() });
  });

  describe('constructor', () => {
    it('should create instance with default concurrency based on cpus * 2', () => {
      const orchestrator = new BinanceCronOrchestrator({ ...defaultConfig });
      expect(orchestrator).toBeDefined();
    });

    it('should use provided maxConcurrency when specified', () => {
      const orchestrator = new BinanceCronOrchestrator({
        ...defaultConfig,
        maxConcurrency: 3,
      });
      expect(orchestrator).toBeDefined();
    });

    it('should cap concurrency at symbols length', () => {
      const orchestrator = new BinanceCronOrchestrator({
        schedule: '*/1 * * * *',
        symbols: ['BTCUSDT'],
        maxConcurrency: 100,
      });
      expect(orchestrator).toBeDefined();
    });
  });

  describe('start', () => {
    it('should schedule cron with provided schedule', () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();
      expect(mockCronSchedule).toHaveBeenCalledWith('*/1 * * * *', expect.any(Function));
    });

    it('should log info on start', () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should execute batch when cron fires', async () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();

      const cronHandler = getCronHandler();
      mockWorkerRun.mockResolvedValue({ fetchedAt: Date.now() });
      mockPersist.mockResolvedValue(undefined);

      await cronHandler();

      expect(mockWorkerRun).toHaveBeenCalledTimes(2);
      expect(mockPersist).toHaveBeenCalledTimes(2);
    });

    it('should skip execution if already running', async () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();

      const cronHandler = getCronHandler();

      let resolveFirstRun: Function;
      const firstRunPromise = new Promise<void>(resolve => {
        resolveFirstRun = resolve;
      });

      mockWorkerRun.mockImplementationOnce(
        () =>
          new Promise<void>(resolve =>
            setTimeout(() => {
              resolve();
              resolveFirstRun!();
            }, 100)
          )
      );
      mockPersist.mockResolvedValue(undefined);

      const run1 = cronHandler();
      const run2 = cronHandler();

      await firstRunPromise;
      await run1;
      await run2;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[BinanceCron] Previous execution still running.'
      );
    });

    it('should handle errors during batch execution', async () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();

      const cronHandler = getCronHandler();
      mockWorkerRun.mockRejectedValue(new Error('Worker failed'));

      await expect(cronHandler()).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle unknown errors during batch execution', async () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();

      const cronHandler = getCronHandler();
      mockWorkerRun.mockRejectedValue('String error' as never);

      await expect(cronHandler()).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[BinanceCron] Unknown batch execution error:',
        { err: 'String error' }
      );
    });

    it('should reset isRunning after execution', async () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();

      const cronHandler = getCronHandler();
      mockWorkerRun.mockResolvedValue({ fetchedAt: Date.now() });
      mockPersist.mockResolvedValue(undefined);

      await cronHandler();
      await cronHandler();

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockWorkerRun).toHaveBeenCalledTimes(4);
    });

    it('should use default candle interval when not provided', async () => {
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);
      orchestrator.start();

      const cronHandler = getCronHandler();
      const BinanceWorker = (jest.requireMock('../../../../src/job/worker/binance.worker') as any)
        .BinanceWorker;

      mockWorkerRun.mockResolvedValue({ fetchedAt: Date.now() });
      mockPersist.mockResolvedValue(undefined);

      await cronHandler();

      expect(BinanceWorker).toHaveBeenCalledWith(expect.objectContaining({ interval: '1m' }));
    });

    it('should use provided candle interval', async () => {
      const orchestrator = new BinanceCronOrchestrator({
        ...defaultConfig,
        candleInterval: '5m',
      });
      orchestrator.start();

      const cronHandler = getCronHandler();
      const BinanceWorker = (jest.requireMock('../../../../src/job/worker/binance.worker') as any)
        .BinanceWorker;

      mockWorkerRun.mockResolvedValue({ fetchedAt: Date.now() });
      mockPersist.mockResolvedValue(undefined);

      await cronHandler();

      expect(BinanceWorker).toHaveBeenCalledWith(expect.objectContaining({ interval: '5m' }));
    });
  });

  describe('persist', () => {
    it('should call MarketDataController.persist with data', async () => {
      const data = { fetchedAt: Date.now() };
      const orchestrator = new BinanceCronOrchestrator(defaultConfig);

      await (orchestrator as any).persist(data);

      expect(mockPersist).toHaveBeenCalledWith(data);
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });
});
