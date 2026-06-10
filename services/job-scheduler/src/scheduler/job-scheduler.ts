import { randomUUID } from 'node:crypto';

import { logger } from '@trading-model/common/config/logger';

import { BackPressure } from './back-pressure';
import { InternalQueue } from './internal-queue';
import { env } from '../config/env';
import { JobRepository } from '../persistence/job-repository';
import { OrphanDetector } from '../recovery/orphan-detector';
import { ReAllocator } from '../recovery/re-allocator';
import { Job } from '../types/job.types';
import { WorkerProtocol } from '../worker/worker-protocol';
import { WorkerRegistry } from '../worker/worker-registry';

export class JobScheduler {
  readonly queue: InternalQueue;
  readonly backPressure: BackPressure;
  readonly workers: WorkerRegistry;
  readonly repository: JobRepository;
  readonly reAllocator: ReAllocator;
  readonly orphanDetector: OrphanDetector;
  private workerProtocol: WorkerProtocol | null = null;

  constructor(repository: JobRepository) {
    this.queue = new InternalQueue(env.ACK_TIMEOUT_MS);
    this.backPressure = new BackPressure(env.MAX_QUEUE_DEPTH, env.MAX_WORKER_LOAD_RATIO);
    this.workers = new WorkerRegistry(env.WORKER_HEARTBEAT_TTL_MS);
    this.repository = repository;
    this.reAllocator = new ReAllocator(repository, this.queue);
    this.orphanDetector = new OrphanDetector(
      this.workers,
      repository,
      this.reAllocator,
      env.ORPHAN_SCAN_INTERVAL_MS,
    );

    this.queue.setOnAckTimeout((jobId) => {
      this.handleAckTimeout(jobId);
    });
  }

  setWorkerProtocol(protocol: WorkerProtocol): void {
    this.workerProtocol = protocol;
  }

  async submit(
    type: string,
    payload: unknown,
    priority: 1 | 2 | 3 | 4 | 5 = 3,
    maxRetries: number = env.MAX_RETRIES_PER_JOB,
  ): Promise<string> {
    if (!this.backPressure.canAccept()) {
      logger.warn('Back pressure active — rejecting job submission');
      throw Object.assign(
        new Error('Job scheduler at capacity'),
        { code: 'BACK_PRESSURE', retryAfter: this.backPressure.retryAfterSeconds() },
      );
    }

    const jobId = randomUUID();
    const now = new Date();

    const job: Job = {
      id: jobId,
      type,
      payload,
      priority,
      status: 'pending',
      ackDeadline: 0,
      maxRetries,
      retryCount: 0,
      createdAt: now,
      history: [],
    };

    await this.repository.insert(job);
    this.enqueueJob(job);

    logger.info('Job submitted', { jobId, type, priority });
    return jobId;
  }

  private enqueueJob(job: Job): void {
    const updated: Job = { ...job, status: 'queued' };
    this.queue.enqueue(updated);
    this.backPressure.updateQueueDepth(this.queue.depth());
    this.repository.updateStatus(job.id, 'queued').catch((err) => {
      logger.error('Failed to persist queued status', { jobId: job.id, error: String(err) });
    });
    this.distributeNext();
  }

  private distributeNext(): void {
    const queued = this.queue.dequeue();
    if (!queued) return;

    const worker = this.workers.findBestWorker(queued.job.type);
    if (!worker) {
      this.queue.enqueue(queued.job);
      return;
    }

    const deadline = Date.now() + env.ACK_TIMEOUT_MS;
    const assignedJob: Job = {
      ...queued.job,
      status: 'assigned',
      assignedWorkerId: worker.workerId,
      ackDeadline: deadline,
    };

    this.queue.markDelivered(assignedJob.id);

    if (this.workerProtocol) {
      this.workerProtocol.sendToWorker(worker.workerId, {
        type: 'job.assigned',
        job: {
          id: assignedJob.id,
          type: assignedJob.type,
          payload: assignedJob.payload,
          ackDeadline: deadline,
        },
      });
    }

    worker.currentLoad += 1;
    this.backPressure.updateWorkerLoad(worker.workerId, worker.currentLoad / worker.maxConcurrency);

    this.repository.updateStatus(assignedJob.id, 'assigned', {
      assignedWorkerId: worker.workerId,
      ackDeadline: deadline,
    }).catch((err) => {
      logger.error('Failed to persist assigned status', { jobId: assignedJob.id, error: String(err) });
    });

    logger.info('Job assigned to worker', {
      jobId: assignedJob.id,
      workerId: worker.workerId,
    });
  }

  private handleAckTimeout(jobId: string): void {
    logger.warn('ACK timeout for job', { jobId });

    this.repository.findById(jobId).then((job) => {
      if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return;

      const workerId = job.assignedWorkerId;
      if (workerId) {
        const worker = this.workers.get(workerId);
        if (worker) {
          worker.currentLoad = Math.max(0, worker.currentLoad - 1);
          this.backPressure.updateWorkerLoad(workerId, worker.currentLoad / worker.maxConcurrency);
        }
      }

      this.repository.updateStatus(jobId, 'orphaned').then(() => {
        this.reAllocator.reallocate(job);
      }).catch((err) => {
        logger.error('Failed to persist orphaned status on ACK timeout', {
          jobId,
          error: String(err),
        });
      });
    }).catch((err) => {
      logger.error('Failed to find job on ACK timeout', {
        jobId,
        error: String(err),
      });
    });
  }

  async ack(jobId: string): Promise<void> {
    this.queue.ack(jobId);
    await this.repository.updateStatus(jobId, 'running');

    logger.info('Job acknowledged by worker', { jobId });
  }

  async complete(jobId: string, result: unknown): Promise<void> {
    this.queue.ack(jobId);
    await this.repository.updateStatus(jobId, 'completed', { result });

    const job = await this.repository.findById(jobId);
    if (job?.assignedWorkerId) {
      const worker = this.workers.get(job.assignedWorkerId);
      if (worker) {
        worker.currentLoad = Math.max(0, worker.currentLoad - 1);
        this.backPressure.updateWorkerLoad(
          job.assignedWorkerId,
          worker.currentLoad / worker.maxConcurrency,
        );
      }
    }

    logger.info('Job completed', { jobId });
    this.distributeNext();
  }

  async fail(jobId: string, error: string): Promise<void> {
    this.queue.ack(jobId);

    const job = await this.repository.findById(jobId);
    if (!job) return;

    if (job.assignedWorkerId) {
      const worker = this.workers.get(job.assignedWorkerId);
      if (worker) {
        worker.currentLoad = Math.max(0, worker.currentLoad - 1);
        this.backPressure.updateWorkerLoad(
          job.assignedWorkerId,
          worker.currentLoad / worker.maxConcurrency,
        );
      }
    }

    if (job.retryCount >= job.maxRetries) {
      await this.repository.updateStatus(jobId, 'failed', { error });

      logger.warn('Job failed permanently', { jobId, retryCount: job.retryCount, error });
    } else {
      const newDeadline = Date.now() + env.ACK_TIMEOUT_MS;
      const updatedJob: Job = {
        ...job,
        status: 'queued',
        ackDeadline: newDeadline,
        retryCount: job.retryCount + 1,
        assignedWorkerId: undefined,
      };

      this.queue.enqueue(updatedJob);
      await this.repository.incrementRetry(jobId);
      await this.repository.updateStatus(jobId, 'queued', {
        ackDeadline: newDeadline,
      });

      logger.info('Job re-queued after failure', { jobId, retryCount: updatedJob.retryCount });
      this.distributeNext();
    }
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.repository.findById(jobId);
    if (!job) return;

    if (job.status === 'running' || job.status === 'completed') {
      throw new Error('Cannot cancel a running or completed job');
    }

    this.queue.ack(jobId);
    await this.repository.updateStatus(jobId, 'cancelled');

    if (job.assignedWorkerId) {
      const worker = this.workers.get(job.assignedWorkerId);
      if (worker) {
        worker.currentLoad = Math.max(0, worker.currentLoad - 1);
      }
    }

    logger.info('Job cancelled', { jobId });
  }

  onWorkerDisconnect(workerId: string): void {
    this.backPressure.removeWorker(workerId);
  }

  async start(): Promise<void> {
    const nonTerminal = await this.repository.findNonTerminal();

    for (const job of nonTerminal) {
      if (job.status === 'queued' || job.status === 'pending') {
        this.queue.enqueue({ ...job, status: 'queued' });
      } else if (job.status === 'assigned' || job.status === 'running') {
        await this.repository.updateStatus(job.id, 'orphaned');
        await this.reAllocator.reallocate(job);
      } else if (job.status === 'orphaned') {
        await this.reAllocator.reallocate(job);
      }
    }

    this.backPressure.updateQueueDepth(this.queue.depth());

    logger.info('Job scheduler started — recovered jobs from persistence', {
      recovered: nonTerminal.length,
    });

    this.orphanDetector.start();
  }

  async stop(): Promise<void> {
    this.orphanDetector.stop();
    this.queue.stop();
    if (this.workerProtocol) {
      this.workerProtocol.close();
    }

    logger.info('Job scheduler stopped');
  }
}
