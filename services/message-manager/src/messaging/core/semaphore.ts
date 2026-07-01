import { AppError, ErrorCodes } from '@trading-model/common/utils/errors';

export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(
    private max: number,
    private maxQueue: number = Infinity
  ) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      throw new AppError(
        'Semaphore queue full — too many pending operations',
        ErrorCodes.BACKPRESSURE
      );
    }
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      queueMicrotask(next);
    } else {
      this.current = Math.max(0, this.current - 1);
    }
  }

  get waiting(): number {
    return this.queue.length;
  }

  get running(): number {
    return this.current;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}