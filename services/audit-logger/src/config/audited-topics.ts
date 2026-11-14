import { AuditEvent } from "@trading-model/contracts/audit-events";
import { DlqEvent } from "@trading-model/contracts/dlq-events";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import { TrainingEvent } from "@trading-model/contracts/training-events";

/** Audit, training and DLQ topics. Market data stays in MySQL (ADR-0027, ADR-0051), not chained. */
export function auditedTopics(): EventEnumMap[] {
	return [
		...Object.values(AuditEvent),
		...Object.values(TrainingEvent),
		...Object.values(DlqEvent),
	];
}
