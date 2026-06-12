export interface AuditEvent {
  timestamp: string;
  topic: string;
  publisher: string;
  correlationId: string;
  summary: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
}

export interface AuditVolumeByTopic {
  topic: string;
  count: number;
}
