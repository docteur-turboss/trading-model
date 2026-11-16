import BrokerMessage from "@trading-model/broker-message";
import { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import type { RedisMessageJournal } from "@trading-model/broker-message/bus/redis-journal";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import type { DeliveredMessage } from "@trading-model/broker-message/messages.controller";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/logger";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { ENV } from "../infrastructure/config/env";
import { auditedTopics } from "./audited-topics";
import { BUS_DEAD_LETTERS } from "./metrics";

const DEAD_LETTER_COUNT_EVERY_MS = 30_000;

/** Sets `bus_dead_letters` per topic of the journal (alert BusDeadLetters, ADR-0073). */
function publishDeadLetterCounts(journal: RedisMessageJournal): void {
	const streams = new DeadStreams(journal);
	const count = async () => {
		const topics = new Set(
			(await journal.groups()).map((group) => group.topic)
		);
		for (const topic of topics) {
			BUS_DEAD_LETTERS.set({ topic }, await streams.length(topic));
		}
	};
	setInterval(() => {
		count().catch((err: unknown) =>
			logger.warn("Dead letter count failed", {
				context: { error: normalizeError(err).message },
			})
		);
	}, DEAD_LETTER_COUNT_EVERY_MS).unref();
}

export async function createBrokerMessage(
	handle: (message: DeliveredMessage) => Promise<void>
): Promise<{
	brokerMessage: BrokerMessage;
}> {
	const journal = busJournalFromEnv(ENV);
	publishDeadLetterCounts(journal);
	const brokerMessage = new BrokerMessage({
		journal,
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		serviceName: ServiceInstanceName.AuditLoggerService,
	});
	await subscribeToAllTopics(brokerMessage, handle);
	return { brokerMessage };
}

async function subscribeToAllTopics(
	brokerMessage: BrokerMessage,
	handle: (message: DeliveredMessage) => Promise<void>
): Promise<void> {
	const allTopics = auditedTopics();
	await brokerMessage.intents(allTopics, handle);
	logger.info("Subscribed to audited topics", {
		context: { topicCount: allTopics.length },
	});
}
