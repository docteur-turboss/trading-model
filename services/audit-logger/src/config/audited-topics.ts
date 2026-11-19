import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import { EVENT_SUBSCRIBERS } from "@trading-model/contracts/event-routes";

/** Audit, training and DLQ topics. Market data stays in MySQL (ADR-0027, ADR-0051), not chained. */
export function auditedTopics(): EventEnumMap[] {
	return [...(EVENT_SUBSCRIBERS[ServiceInstanceName.AuditLoggerService] ?? [])];
}
