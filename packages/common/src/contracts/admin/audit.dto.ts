import type { CorrelationId, Topic, UnixTimestamp } from "../../domain/primitives";

export enum Severity {
	Info = "INFO",
	Warning = "WARNING",
	Error = "ERROR",
	Critical = "CRITICAL",
}

export interface AuditFilter {
	topic?: string;
	publisher?: string;
	correlationId?: string;
}

export interface AuditEvent {
	timestamp: UnixTimestamp;
	topic: Topic;
	publisher: string;
	correlationId: CorrelationId;
	summary: string;
	severity: Severity;
}

export interface AuditVolumeByTopic {
	topic: string;
	count: number;
}
