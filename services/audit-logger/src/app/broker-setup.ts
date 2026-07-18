import BrokerMessage from "@trading-model/broker-message";
import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import { buildTlsFromEnv } from "@trading-model/common/domain/tls-paths";
import { ENV } from "../config/env";

export async function createBrokerMessage(): Promise<{
	brokerMessage: BrokerMessage;
}> {
	const { AddressManager } = await import("../config/address-manager.js");
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
	const [{ MarketEvent }, { AuditEvent }, { CertificateEvent }] =
		await Promise.all([
			import("@trading-model/validation/contracts/market-events"),
			import("@trading-model/validation/contracts/audit-events"),
			import("@trading-model/validation/contracts/certificate-events"),
		]);
	const allTopics = [
		...Object.values(MarketEvent),
		...Object.values(AuditEvent),
		...Object.values(CertificateEvent),
	];
	await brokerMessage.intents(allTopics);
	logger.info("Subscribed to all event topics", {
		context: { topicCount: allTopics.length },
	});
}
