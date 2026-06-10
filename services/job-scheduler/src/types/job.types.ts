export type JobStatus =
  | 'pending'
  | 'queued'
  | 'assigned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'orphaned';

export interface JobEvent {
  fromStatus: JobStatus;
  toStatus: JobStatus;
  timestamp: Date;
  reason: string;
}

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  priority: 1 | 2 | 3 | 4 | 5;
  status: JobStatus;
  assignedWorkerId?: string;
  ackDeadline: number;
  maxRetries: number;
  retryCount: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  history: JobEvent[];
}

export interface QueuedJob<T = unknown> {
  job: Job<T>;
  state: 'queued' | 'delivered' | 'acknowledged';
  deliveryAttempts: number;
  expiresAt: number;
  assignedAt?: Date;
}

export interface SchedulerScaleUpEvent {
  event: 'scheduler.scale-up';
  jobType: string;
  queueDepth: number;
  availableWorkers: number;
  suggestedCount: number;
}

export interface SchedulerScaleDownEvent {
  event: 'scheduler.scale-down';
  jobType: string;
  workerCount: number;
  avgLoad: number;
}

export const JOB_STATUS_NON_TERMINAL: JobStatus[] = [
  'pending',
  'queued',
  'assigned',
  'running',
  'orphaned',
];
