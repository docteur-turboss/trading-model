import { QueuedJob, Job } from '../types/job.types';

export class InternalQueue {
  private readonly queues: Map<number, QueuedJob[]> = new Map();
  private readonly ackTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly ackTimeoutMs: number;
  private onAckTimeoutCallback: ((jobId: string) => void) | null = null;

  constructor(ackTimeoutMs: number) {
    this.ackTimeoutMs = ackTimeoutMs;
  }

  setOnAckTimeout(callback: (jobId: string) => void): void {
    this.onAckTimeoutCallback = callback;
  }

  enqueue(job: Job): void {
    const priority = job.priority;
    if (!this.queues.has(priority)) {
      this.queues.set(priority, []);
    }
    this.queues.get(priority)!.push({
      job,
      state: 'queued',
      deliveryAttempts: 0,
      expiresAt: 0,
    });
  }

  dequeue(): QueuedJob | null {
    for (let p = 1; p <= 5; p++) {
      const queue = this.queues.get(p);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  markDelivered(jobId: string): void {
    const timer = setTimeout(() => {
      this.ackTimers.delete(jobId);
      if (this.onAckTimeoutCallback) {
        this.onAckTimeoutCallback(jobId);
      }
    }, this.ackTimeoutMs);
    this.ackTimers.set(jobId, timer);
  }

  ack(jobId: string): void {
    const timer = this.ackTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.ackTimers.delete(jobId);
    }
  }

  depth(): number {
    let total = 0;
    for (const q of this.queues.values()) {
      total += q.length;
    }
    return total;
  }

  stop(): void {
    for (const timer of this.ackTimers.values()) {
      clearTimeout(timer);
    }
    this.ackTimers.clear();
  }
}
