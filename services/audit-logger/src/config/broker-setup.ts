import BrokerMessage from "@trading-model/broker-message";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import type { EventMap } from "@trading-model/contracts/event-map";
import { logger } from "@trading-model/http/logger";
import { InstanceId } from "@trading-model/primitives/primitives";
import type { createAuditRecorder } from "../adapters/inbound/subscription/audit-subscriber";
import type { DeliveredEnvelope } from "../adapters/outbound/persistence/audit-document-builder";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";
import { auditedTopics } from "./audited-topics";

export async function createBrokerMessage(
	record: ReturnType<typeof createAuditRecorder>
): Promise<{
	brokerMessage: BrokerMessage;
}> {
	const brokerMessage = new BrokerMessage({
		journal: busJournalFromEnv(ENV),
		addressManagerClient: AddressManager,
		tlsPaths: buildTlsFromEnv(ENV),
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: ServiceInstanceName.AuditLoggerService,
	});
	const allTopics = auditedTopics();
	for (const topic of allTopics) {
		// The bus metadata is the full envelope metadata: kept as sent, like the callback route.
		brokerMessage.on(topic as keyof EventMap, (payload, metadata) =>
			record({ metadata: metadata as DeliveredEnvelope["metadata"], payload })
		);
	}
	await brokerMessage.intents(allTopics);
	logger.info("Subscribed to audited topics", {
		context: { topicCount: allTopics.length },
	});
	return { brokerMessage };
}
