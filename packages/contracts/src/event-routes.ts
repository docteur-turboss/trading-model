import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { AuditEvent } from "./audit-events";
import { DlqEvent } from "./dlq-events";
import type { EventEnumMap } from "./event-map";
import { MarketEvent } from "./market-events";
import { TrainingEvent } from "./training-events";

const SCRAPER = [ServiceInstanceName.FinancialScraperService];

/**
 * Services allowed to publish each topic (ADR-0073 §5, issue #1620). Redis ACLs
 * (`deploy/k8s/infra/redis-ha.sh`) and the consumer check are both derived from it.
 * `dlq.entry.added` comes from whichever subscriber dead-letters a message.
 */
export const EVENT_PUBLISHERS: Record<
	EventEnumMap,
	readonly ServiceInstanceName[]
> = {
	[MarketEvent.FetchRecentTrades]: SCRAPER,
	[MarketEvent.Fetch24hrTickerStats]: SCRAPER,
	[MarketEvent.FetchCandlestickSeries]: SCRAPER,
	[MarketEvent.FetchOrderBookSnapshot]: SCRAPER,
	[MarketEvent.FetchPriceTickerSnapshot]: SCRAPER,
	[MarketEvent.FetchOrderBookTickerSnapshot]: SCRAPER,
	[TrainingEvent.ModelPublished]: [ServiceInstanceName.TraderTrainerService],
	[AuditEvent.AuditHeartbeat]: [ServiceInstanceName.AuditLoggerService],
	[AuditEvent.AuditGapDetected]: [ServiceInstanceName.AuditLoggerService],
	[DlqEvent.EntryAdded]: [
		ServiceInstanceName.AuditLoggerService,
		ServiceInstanceName.ModelEvaluatorService,
	],
	[DlqEvent.ReplayCompleted]: [
		ServiceInstanceName.DlqService,
		ServiceInstanceName.AuditLoggerService,
	],
	[DlqEvent.EntriesDeleted]: [
		ServiceInstanceName.DlqService,
		ServiceInstanceName.AuditLoggerService,
	],
};

/** Bus services and the topics they subscribe to (Redis users of `redis-ha.sh`). */
export const EVENT_SUBSCRIBERS: Partial<
	Record<ServiceInstanceName, readonly EventEnumMap[]>
> = {
	[ServiceInstanceName.AuditLoggerService]: [
		...Object.values(AuditEvent),
		...Object.values(TrainingEvent),
		...Object.values(DlqEvent),
	],
	[ServiceInstanceName.ModelEvaluatorService]: [TrainingEvent.ModelPublished],
};

/** False only for a known topic published under a name outside its publishers. */
export function isExpectedPublisher(topic: string, publisher: string): boolean {
	const allowed = EVENT_PUBLISHERS[topic as EventEnumMap] as
		| readonly string[]
		| undefined;
	return !allowed || allowed.includes(publisher);
}
