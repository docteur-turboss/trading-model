import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

import { IServiceCache } from './service-cache.interface';
import { ServiceHealthChecker } from './service-health-checker';
import { ScheduledJob } from '../scheduler/scheduler';

export class CacheHealthRefresher implements ScheduledJob {
  public readonly schedule: string;
  private offset = 0;
  private previousEntriesLength = 0;
  private running = false;

  constructor(
    private readonly serviceCache: IServiceCache,
    private readonly healthChecker: ServiceHealthChecker,
    checkIntervalMs: number
  ) {
    this.schedule = `*/${Math.max(1, Math.floor(checkIntervalMs / 1000))} * * * * *`;
  }

  async execute(): Promise<void> {
    if (this.running) {
      logger.warn('CacheHealthRefresher: previous execution still running, skipping tick');
      return;
    }
    this.running = true;
    try {
      await this.doExecute();
    } finally {
      this.running = false;
    }
  }

  private async doExecute(): Promise<void> {
    const entries = await this.serviceCache.entries();
    if (entries.length === 0) return;

    if (entries.length !== this.previousEntriesLength) {
      this.offset = 0;
      this.previousEntriesLength = entries.length;
    }

    const fraction = Math.max(1, Math.floor(entries.length / 3));
    if (this.offset >= entries.length) {
      this.offset = 0;
    }

    const toCheck = entries.slice(this.offset, this.offset + fraction);
    this.offset = (this.offset + fraction) % entries.length;

    const CONCURRENCY_LIMIT = 10;
    const errors: PromiseRejectedResult[] = [];

    for (let i = 0; i < toCheck.length; i += CONCURRENCY_LIMIT) {
      const chunk = toCheck.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.allSettled(
        chunk.map(async ({ serviceName, instance }) => {
          const healthy = await this.healthChecker.isHealthy(instance);
          if (!healthy) {
            await this.serviceCache.invalidate(serviceName);
            logger.warn('Cache health refresher invalidated unhealthy service', { serviceName });
          }
        })
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          errors.push(result);
        }
      }
    }

    for (const error of errors) {
      logger.error('Cache health refresher check failed', {
        error: normalizeError(error.reason),
      });
    }
  }
}
