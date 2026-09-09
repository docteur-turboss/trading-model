import type {
	AuditSummary,
	CorrelationId,
	ServiceId,
	Topic,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

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
	summary: AuditSummary;
	severity: Severity;
}
