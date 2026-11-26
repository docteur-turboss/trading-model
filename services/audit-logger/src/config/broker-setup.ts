import BusClient from "@trading-model/broker-message";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import type { DeliveredMessage } from "@trading-model/broker-message/messages.controller";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { logger } from "@trading-model/http/logger";
import { InstanceId } from "@trading-model/primitives/primitives";
import { ENV } from "../infrastructure/config/env";
import { auditedTopics } from "./audited-topics";

export async function createBusClient(
	handle: (message: DeliveredMessage) => Promise<void>
): Promise<{
	brokerMessage: BusClient;
}> {
	const journal = busJournalFromEnv(ENV);
	const brokerMessage = new BusClient({
		journal,
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: ServiceInstanceName.AuditLoggerService,
	});
	const allTopics = auditedTopics();
	await brokerMessage.subscribe(allTopics, handle);
	logger.info("Subscribed to audited topics", {
		context: { topicCount: allTopics.length },
	});
	return { brokerMessage };
}
