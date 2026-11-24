import { HELPER } from "@trading-model/broker-message";
import type { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import { publishToBus } from "@trading-model/broker-message/bus/publisher";
import type { RedisMessageJournal } from "@trading-model/broker-message/bus/redis-journal";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { DlqEvent, isDlqEventTopic } from "@trading-model/contracts/dlq-events";
import { getLogger } from "@trading-model/contracts/logger-registry";
import {
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import type { DeadLetterInput } from "../domain/ports/dead-letter-store.port";
import { ENV } from "../infrastructure/config/env";
import { BUS_DEAD_LETTERS } from "./metrics";

/**
 * Records `dlq.entry.added` on the audit trail. Never rejects: the dead
 * letter is already stored. A dead letter of a `dlq.*` event publishes
 * nothing (it would loop while audit-logger is down).
 */
export function auditDeadLetter(
	journal: RedisMessageJournal,
	{ message, reason }: DeadLetterInput,
	deadId: string
): void {
	const topic = message.metadata.topic;
	if (isDlqEventTopic(topic)) {
		return;
	}
	const metadata = new HELPER.metadataBuilder(
		Topic.of(DlqEvent.EntryAdded),
		DlqEvent.EntryAdded,
		{
			instanceId: InstanceId.of(ENV.INSTANCE_ID),
			serviceName: ServiceId.of(ServiceInstanceName.MessageManagerService),
		}
	)
		.setDelivery({ mode: DeliveryMode.AtLeastOnce })
		.toJSON();
	publishToBus(
		journal,
		{ entryId: deadId, topic, reason, actor: null },
		metadata
	).catch((err: unknown) =>
		getLogger().error(
			"Dead-letter event not published: the audit trail misses it",
			{
				context: { topic, deadId, error: normalizeError(err).message },
			}
		)
	);
}

/** Sets `bus_dead_letters` per topic of the journal. */
export async function publishDeadLetterCounts(
	journal: RedisMessageJournal,
	streams: DeadStreams
): Promise<void> {
	const topics = new Set((await journal.groups()).map((group) => group.topic));
	for (const topic of topics) {
		BUS_DEAD_LETTERS.set({ topic }, await streams.length(topic));
	}
}
