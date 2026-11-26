import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { AuditEvent } from "./audit-events";
import { DlqEvent } from "./dlq-events";
import type { EventEnumMap } from "./event-map";
import { RiskEvent } from "./risk-events";
import { TrainingEvent } from "./training-events";

const TRAINER = ServiceInstanceName.TraderTrainerService;
const AUDIT = ServiceInstanceName.AuditLoggerService;
const RISK = ServiceInstanceName.RiskExecutionService;

/** Services allowed to publish each topic (ADR-0073 §5). `market.*` topics have no publisher since ADR-0078. `dlq.entry.added` comes from any subscriber that dead-letters. */
export const EVENT_PUBLISHERS: Partial<
	Record<EventEnumMap, readonly ServiceInstanceName[]>
> = {
	[TrainingEvent.ModelPublished]: [TRAINER],
	[AuditEvent.AuditHeartbeat]: [AUDIT],
	[AuditEvent.AuditGapDetected]: [AUDIT],
	[DlqEvent.EntryAdded]: [AUDIT, ServiceInstanceName.ModelEvaluatorService],
	[DlqEvent.ReplayCompleted]: [AUDIT],
	[DlqEvent.EntriesDeleted]: [AUDIT],
	[RiskEvent.OrderTransitioned]: [RISK],
	[RiskEvent.KillSwitchEngaged]: [RISK],
	[RiskEvent.KillSwitchRearmed]: [RISK],
	[RiskEvent.PromotionLoaded]: [ServiceInstanceName.DecisionConsumerService],
};

/** Bus services and the topics they subscribe to (Redis users of `redis-ha.sh`). */
export const EVENT_SUBSCRIBERS: Partial<
	Record<ServiceInstanceName, readonly EventEnumMap[]>
> = {
	[AUDIT]: [
		...Object.values(AuditEvent),
		...Object.values(TrainingEvent),
		...Object.values(DlqEvent),
		...Object.values(RiskEvent),
	],
	[ServiceInstanceName.ModelEvaluatorService]: [TrainingEvent.ModelPublished],
};

/** False for a topic absent from `EVENT_PUBLISHERS` and for a publisher outside its list. */
export function isExpectedPublisher(topic: string, publisher: string): boolean {
	const allowed = EVENT_PUBLISHERS[topic as EventEnumMap] as
		| readonly string[]
		| undefined;
	return Boolean(allowed?.includes(publisher));
}
