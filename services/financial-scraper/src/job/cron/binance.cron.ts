/**
 * BinanceCronOrchestrator
 * -----------------------
 * Intelligent orchestrator for Binance workers.
 *
 * Responsibilities:
 *  - Scheduling via node-cron
 *  - Dynamic worker scaling
 *  - Concurrency control
 *  - Basic backpressure handling
 *
 * Designed for horizontally scaled environments.
 */

import os from 'os';

import cron from 'node-cron';
import pLimit from 'p-limit';

import { logger } from '@trading-model/common/config/logger';

import { MarketDataController } from '../../infra/market-data/market-data.controller';
import { BinanceWorker, BinanceWorkerResult } from '../worker/binance.worker';

/** Configuration for scheduling a BinanceCronOrchestrator instance. */
export interface CronConfig {
  schedule: string; // e.g. "*/1 * * * *"
  symbols: string[];
  maxConcurrency?: number;
  candleInterval?: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

export class BinanceCronOrchestrator {
  private readonly maxConcurrency: number;
  private isRunning = false;

  constructor(private readonly config: CronConfig) {
    /**
     * Default concurrency:
     * - Number of CPUs * 2 (I/O bound workload)
     * - Capped by the number of symbols
     */
    const cpuBased = os.cpus().length * 2;

    this.maxConcurrency = config.maxConcurrency ?? Math.min(cpuBased, config.symbols.length);
  }

  /**
   * Starts the cron scheduler.
   */
  public start(): void {
    cron.schedule(this.config.schedule, async () => {
      if (this.isRunning) {
        logger.warn('[BinanceCron] Previous execution still running.');
        return;
      }

      this.isRunning = true;

      try {
        await this.executeBatch();
      } catch (err) {
        if (err instanceof Error) {
          logger.error('[BinanceCron] Batch execution error:', {
            err: err.message,
          });
        } else {
          logger.error('[BinanceCron] Unknown batch execution error:', { err: String(err) });
        }
      } finally {
        this.isRunning = false;
      }
    });

    logger.info(`[BinanceCron] Scheduled with maxConcurrency=${this.maxConcurrency}`);
  }

  /**
   * Batch execution with concurrency limiting.
   */
  private async executeBatch(): Promise<void> {
    const limiter = pLimit(this.maxConcurrency);

    const tasks = this.config.symbols.map(symbol =>
      limiter(async () => {
        const worker = new BinanceWorker({
          symbol,
          interval: this.config.candleInterval ?? '1m',
        });

        const result = await worker.run();

        await this.persist(result);
      })
    );

    await Promise.all(tasks);
  }

  /**
   * Extension point for persistence.
   * Can be overridden or injected.
   */
  protected async persist(data: BinanceWorkerResult): Promise<void> {
    await MarketDataController.persist(data);

    logger.debug('[BinanceCron] Data fetched at: ' + Date.now());
  }
}
