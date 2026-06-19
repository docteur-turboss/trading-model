export interface CallRecord {
  targetService: string;
  endpoint: string;
  method: string;
  timestamp: number;
  durationMs: number;
  status: 'success' | 'error';
  bytesSent?: number;
  bytesReceived?: number;
  errorMessage?: string;
}

export interface CallTrackerSnapshot {
  totalCalls: number;
  callsByService: Record<string, number>;
  callsByEndpoint: Record<string, number>;
  errorsTotal: number;
  avgLatencyMs: number;
  totalBytesSent: number;
  totalBytesReceived: number;
}

export class ServiceCallTracker {
  private records: CallRecord[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords: number = 1000) {
    this.maxRecords = maxRecords;
  }

  record(call: CallRecord): void {
    this.records.push(call);
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }
  }

  snapshot(): CallTrackerSnapshot {
    const total = this.records.length;
    if (total === 0) {
      return {
        totalCalls: 0,
        callsByService: {},
        callsByEndpoint: {},
        errorsTotal: 0,
        avgLatencyMs: 0,
        totalBytesSent: 0,
        totalBytesReceived: 0,
      };
    }

    const callsByService: Record<string, number> = {};
    const callsByEndpoint: Record<string, number> = {};
    let errorsTotal = 0;
    let totalLatency = 0;
    let bytesSent = 0;
    let bytesReceived = 0;

    for (const r of this.records) {
      callsByService[r.targetService] = (callsByService[r.targetService] ?? 0) + 1;
      const ep = `${r.method} ${r.endpoint}`;
      callsByEndpoint[ep] = (callsByEndpoint[ep] ?? 0) + 1;
      if (r.status === 'error') errorsTotal++;
      totalLatency += r.durationMs;
      bytesSent += r.bytesSent ?? 0;
      bytesReceived += r.bytesReceived ?? 0;
    }

    return {
      totalCalls: total,
      callsByService,
      callsByEndpoint,
      errorsTotal,
      avgLatencyMs: Math.round(totalLatency / total),
      totalBytesSent: bytesSent,
      totalBytesReceived: bytesReceived,
    };
  }

  clear(): void {
    this.records = [];
  }

  getRecords(): readonly CallRecord[] {
    return this.records;
  }
}
