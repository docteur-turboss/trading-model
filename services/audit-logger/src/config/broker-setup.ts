import BrokerMessage from "@trading-model/broker-message";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { logger } from "@trading-model/http/infrastructure/logger";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";
import { auditedTopics } from "./audited-topics";

export async function createBrokerMessage(): Promise<{
	brokerMessage: BrokerMessage;
}> {
	const brokerMessage = new BrokerMessage({
		addressManagerClient: AddressManager,
		tlsPaths: buildTlsFromEnv(ENV),
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		serviceName: ServiceInstanceName.AuditLoggerService,
	});
	await subscribeToAllTopics(brokerMessage);
	return { brokerMessage };
}

async function subscribeToAllTopics(
	brokerMessage: BrokerMessage
): Promise<void> {
	const allTopics = auditedTopics();
	await brokerMessage.intents(allTopics);
	logger.info("Subscribed to audited topics", {
		context: { topicCount: allTopics.length },
	});
}
