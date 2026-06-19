import { randomUUID } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';



export interface WorkerPoolOptions {
  size?: number;
  workerScript?: string;
  maxQueueSize?: number;
}

interface TaskEntry {
  id: string;
  type: string;
  data: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface WorkerEntry {
  worker: import('node:worker_threads').Worker;
  busy: boolean;
}

export class WorkerPool {
  private readonly workers: WorkerEntry[] = [];
  private readonly pendingTasks = new Map<string, TaskEntry>();
  private readonly queue: TaskEntry[] = [];
  private readonly workerScript: string;
  private readonly poolSize: number;
  private readonly maxQueueSize: number;
  private started = false;
  private terminated = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.poolSize = options.size ?? availableParallelism();
    this.maxQueueSize = options.maxQueueSize ?? Infinity;
    this.workerScript =
      options.workerScript ?? join(__dirname, 'worker-script.js');
  }

  /** Crée les workers s'ils ne le sont pas encore — idempotent. */
  start(): void {
    this.ensureStarted();
  }

  execute<T>(type: string, data: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.terminated) {
        reject(new Error('WorkerPool is terminated'));
        return;
      }

      this.ensureStarted();

      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('WorkerPool queue is full'));
        return;
      }

      const entry: TaskEntry = {
        id: randomUUID(),
        type,
        data,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      this.pendingTasks.set(entry.id, entry);

      const idleWorker = this.workers.find(w => !w.busy);
      if (idleWorker) {
        this.dispatch(idleWorker, entry);
      } else {
        this.queue.push(entry);
      }
    });
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.workers.filter(w => w.busy).length;
  }

  get size(): number {
    return this.workers.length;
  }

  async terminate(): Promise<void> {
    this.terminated = true;

    for (const entry of this.queue) {
      entry.reject(new Error('WorkerPool terminated'));
    }
    this.queue.length = 0;

    for (const entry of this.pendingTasks.values()) {
      entry.reject(new Error('WorkerPool terminated'));
    }
    this.pendingTasks.clear();

    for (const w of this.workers) {
      w.worker.removeAllListeners();
    }
    await Promise.all(
      this.workers.map(w => w.worker.terminate())
    );
    this.workers.length = 0;
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;

    for (let i = 0; i < this.poolSize; i++) {
      this.spawnWorker();
    }
  }

  private spawnWorker(): void {
    const worker = new Worker(this.workerScript);

    const entry: WorkerEntry = { worker, busy: false };

    worker.on('message', (msg: { id: string; success: boolean; data?: unknown; error?: string }) => {
      entry.busy = false;

      const task = this.pendingTasks.get(msg.id);
      if (task) {
        this.pendingTasks.delete(msg.id);
        if (msg.success) {
          task.resolve(msg.data);
        } else {
          task.reject(new Error(msg.error ?? 'Unknown worker error'));
        }
      }

      this.processQueue();
    });

    worker.on('error', () => {
      entry.busy = false;
      this.replaceWorker(entry);
    });

    worker.on('exit', (code: number) => {
      entry.busy = false;
      if (code !== 0 && !this.terminated) {
        this.replaceWorker(entry);
      }
    });

    this.workers.push(entry);
  }

  private replaceWorker(entry: WorkerEntry): void {
    const idx = this.workers.indexOf(entry);
    if (idx !== -1) {
      entry.worker.removeAllListeners();
      this.workers.splice(idx, 1);
      if (!this.terminated) {
        this.spawnWorker();
      }
    }
  }

  private dispatch(entry: WorkerEntry, task: TaskEntry): void {
    entry.busy = true;
    entry.worker.postMessage({
      id: task.id,
      type: task.type,
      data: task.data,
    });
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const idleWorker = this.workers.find(w => !w.busy);
      if (!idleWorker) break;

      const next = this.queue.shift()!;
      this.dispatch(idleWorker, next);
    }
  }
}
