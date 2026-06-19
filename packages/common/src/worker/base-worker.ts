import { randomUUID } from 'node:crypto';

import { WorkerClient, WorkerClientConfig } from './worker-client';
import { SchedulerWsJobAssignedMessage } from '../contracts/worker-protocol.types';
import { HttpClient } from '../config/http-client';

export interface BaseWorkerConfig {
  workerId?: string;
  serverUrl: string;
  schedulerHttpUrl: string;
  capabilities: string[];
  maxConcurrency: number;
  heartbeatIntervalMs?: number;
  tlsConfig?: { ca?: string; cert?: string; key?: string };
}

export type JobHandler<T = unknown> = (
  job: { id: string; type: string; payload: T }
) => Promise<unknown>;

interface ActiveJob {
  id: string;
  type: string;
  ackDeadline: number;
  timer: ReturnType<typeof setTimeout>;
}

export class BaseWorker {
  protected readonly client: WorkerClient;
  protected readonly httpClient: HttpClient;
  private readonly handlers = new Map<string, JobHandler>();
  private readonly activeJobs = new Map<string, ActiveJob>();
  private drainRequested = false;
  private readonly boundOnJobAssigned: (job: SchedulerWsJobAssignedMessage['job']) => void;
  private readonly boundOnDrain: () => void;

  constructor(protected readonly config: BaseWorkerConfig) {
    const workerId = config.workerId ?? `${this.constructor.name}-${randomUUID().slice(0, 8)}`;

    const clientConfig: WorkerClientConfig = {
      workerId,
      serverUrl: config.serverUrl,
      capabilities: config.capabilities,
      maxConcurrency: config.maxConcurrency,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
    };

    this.client = new WorkerClient(clientConfig);
    this.httpClient = new HttpClient(config.tlsConfig);

    this.boundOnJobAssigned = this.onJobAssigned.bind(this);
    this.boundOnDrain = this.onDrain.bind(this);
    this.client.on('job.assigned', this.boundOnJobAssigned);
    this.client.on('drain', this.boundOnDrain);
  }

  registerHandler<P = unknown>(jobType: string, handler: JobHandler<P>): void {
    this.handlers.set(jobType, handler as JobHandler);
  }

  async start(): Promise<void> {
    await this.client.connect();
  }

  async stop(): Promise<void> {
    for (const [, active] of this.activeJobs) {
      clearTimeout(active.timer);
    }
    this.activeJobs.clear();
    this.client.off('job.assigned', this.boundOnJobAssigned);
    this.client.off('drain', this.boundOnDrain);
    this.client.disconnect();
  }

  private async onJobAssigned(job: SchedulerWsJobAssignedMessage['job']): Promise<void> {
    if (this.drainRequested) {
      await this.failJob(job.id, 'Worker is draining');
      return;
    }

    const remaining = job.ackDeadline - Date.now();
    const ackTimer = setTimeout(() => {
      this.activeJobs.delete(job.id);
    }, Math.max(remaining, 0));

    const activeJob: ActiveJob = { id: job.id, type: job.type, ackDeadline: job.ackDeadline, timer: ackTimer };
    this.activeJobs.set(job.id, activeJob);

    try {
      await this.ackJob(job.id);

      const handler = this.handlers.get(job.type);
      if (!handler) {
        await this.failJob(job.id, `No handler registered for job type: ${job.type}`);
        return;
      }

      const result = await handler({ id: job.id, type: job.type, payload: job.payload });
      await this.completeJob(job.id, result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.failJob(job.id, errorMessage);
    } finally {
      clearTimeout(ackTimer);
      this.activeJobs.delete(job.id);
      this.client.sendHeartbeat(this.activeJobs.size);
    }
  }

  private async ackJob(jobId: string): Promise<void> {
    await this.httpClient.post(`${this.config.schedulerHttpUrl}/jobs/${jobId}/ack`);
  }

  private async completeJob(jobId: string, result: unknown): Promise<void> {
    await this.httpClient.post(`${this.config.schedulerHttpUrl}/jobs/${jobId}/complete`, { result });
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    await this.httpClient.post(`${this.config.schedulerHttpUrl}/jobs/${jobId}/fail`, { error });
  }

  private onDrain(): void {
    this.drainRequested = true;
  }

  get activeJobCount(): number {
    return this.activeJobs.size;
  }

  get isDraining(): boolean {
    return this.drainRequested;
  }
}
