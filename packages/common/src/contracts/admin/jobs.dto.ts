export interface JobEntry {
  id: string;
  type: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
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

export interface JobStats {
  pending: number;
  inProgress: number;
  failed: number;
}
