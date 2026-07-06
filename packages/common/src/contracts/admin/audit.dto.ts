import type { CorrelationId, ServiceId, Topic, UnixTimestamp } from "../../domain/primitives";

export enum Severity {
	Info = "INFO",
	Warning = "WARNING",
	Error = "ERROR",
	Critical = "CRITICAL",
}

export interface AuditFilter {
	topic?: Topic;
	publisher?: ServiceId;
	correlationId?: CorrelationId;
}

export interface AuditEvent {
	timestamp: UnixTimestamp;
	topic: Topic;
	publisher: ServiceId;
	correlationId: CorrelationId;
	summary: string;
	severity: Severity;
}

export interface AuditVolumeByTopic {
	topic: Topic;
	count: number;
}
