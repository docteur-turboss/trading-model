export interface ServiceRegistry {
  services: ServiceRegistryEntry[];
  topology: TopologyLink[];
}

export interface ServiceRegistryEntry {
  serviceName: string;
  instances: ServiceInstance[];
}

export interface ServiceInstance {
  instanceId: string;
  host: string;
  port: number;
  version: string;
  heartbeat: string;
  status: 'healthy' | 'degraded' | 'down';
  ipPort: string;
}

export interface TopologyLink {
  source: string;
  target: string;
  status: 'healthy' | 'degraded' | 'down';
}

export interface StatsSummary {
  activeServices: number;
  totalServices: number;
  totalInstances: number;
  errorsRate: number;
  avgLatency: number;
}

export interface AuditEvent {
  timestamp: string;
  topic: string;
  publisher: string;
  correlationId: string;
  summary: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
}

export interface AuditFilter {
  topic?: string;
  publisher?: string;
  correlationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedEvents {
  events: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  volumeByTopic: { topic: string; count: number }[];
}

export interface JobEntry {
  id: string;
  type: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  status: string;
  worker: string | null;
}

export interface JobDetail {
  id: string;
  type: string;
  priority: string;
  status: string;
  worker: string | null;
  timeline: JobTimelineEntry[];
  payload: Record<string, unknown>;
  logs: string[];
}

export interface JobTimelineEntry {
  event: string;
  timestamp: string;
  description: string;
  active?: boolean;
}

export interface JobList {
  jobs: JobEntry[];
  stats: { pending: number; inProgress: number; failed: number };
}

export interface DlqMessage {
  id: string;
  timestamp: string;
  topic: string;
  messageId: string;
  failureReason: string;
  attempts: number;
  payloadPreview: string;
}

export interface DlqMessageList {
  messages: DlqMessage[];
  stats: { pending: number; retryRate: number; totalSize: number; lastIncident: string };
}

export interface TrainingResult {
  id: string;
  symbol: string;
  generation: number;
  fitness: number;
  sharpe: number;
  genome?: {
    modelId: string;
    layers: TrainingLayer[];
    optimizer: string;
    learningRate: number;
    mutationRate: number;
  };
  convergenceData?: { fitness: number[] };
}

export interface TrainingLayer {
  type: string;
  units?: number;
  activation?: string;
  rate?: number;
}

export interface PaginatedResults {
  results: TrainingResult[];
  total: number;
}

export interface TrainingFilter {
  symbol?: string;
  generation?: number;
}

export interface CacheEntry {
  key: string;
  service: string;
  expiration: string;
  size: string;
  lastAccess: string;
  status?: string;
}

export interface CacheEntryList {
  entries: CacheEntry[];
  stats: { hitRate: number; activeEntries: number };
}

export interface WorkerEntry {
  id: string;
  ip: string;
  region: string;
  cpu: number;
  ram: number;
  status: 'Online' | 'Draining' | 'Offline';
  heartbeat: string;
  activeJobs: number;
}

export interface WorkerList {
  workers: WorkerEntry[];
  stats: {
    activeWorkers: number;
    totalWorkers: number;
    avgCpu: number;
    totalJobsPerMin: number;
    clusterMemory: number;
  };
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export interface ConfigEntry {
  key: string;
  value: string;
  masked: boolean;
  source: 'Vault' | 'ConfigMap' | 'EnvVar' | 'Local';
  service: string;
  updatedAt: string;
}

export interface CertificateEntry {
  id: string;
  commonName: string;
  fingerprint: string;
  expiresAt: string;
  status: 'valid' | 'expiring' | 'revoked';
  issuer: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
