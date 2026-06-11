export interface DlqMessage {
  id: string;
  timestamp: string;
  topic: string;
  messageId: string;
  failureReason: string;
  attempts: number;
  payloadPreview: string;
}

export interface DlqStats {
  pending: number;
  retryRate: number;
  totalSize: number;
  lastIncident: string;
}
