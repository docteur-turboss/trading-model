import { AuditEvent } from "@trading-model/contracts/audit-events";
import { DlqEvent } from "@trading-model/contracts/dlq-events";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import { MarketEvent } from "@trading-model/contracts/market-events";
import { TrainingEvent } from "@trading-model/contracts/training-events";

/** Every event topic of the platform: the audit trail records them all. */
export function auditedTopics(): EventEnumMap[] {
	return [
		...Object.values(MarketEvent),
		...Object.values(AuditEvent),
		...Object.values(TrainingEvent),
		...Object.values(DlqEvent),
	];
}
