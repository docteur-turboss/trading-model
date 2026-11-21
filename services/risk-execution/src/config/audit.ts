import { HELPER } from "@trading-model/broker-message";
import { createMessageManager } from "@trading-model/broker-message/create-message-manager";
import { parseServiceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { RiskEvent } from "@trading-model/contracts/risk-events";
import {
	toInstanceId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";

/** Domain events that go on the bus; the others (`broker.error`, ...) stay in the log. */
const BUS_EVENTS: Record<string, RiskEvent> = {
	"order.transition": RiskEvent.OrderTransitioned,
	"kill_switch.engaged": RiskEvent.KillSwitchEngaged,
	"kill_switch.rearmed": RiskEvent.KillSwitchRearmed,
};

type MessageManager = ReturnType<typeof createMessageManager>["messageManager"];

let messageManager: MessageManager | undefined;

/** Built on first use: the broker client loads the SVID. */
function _messageManager(): MessageManager {
	// No journal: the Redis user of the service only publishes through message-manager.
	messageManager ??= createMessageManager({
		addressManagerClient: AddressManager,
		tlsPaths: buildTlsFromEnv(ENV),
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		serviceName: parseServiceName(ENV.SERVICE_NAME),
		callbackPath: ENV.MESSAGE_CALLBACK_PATH,
	}).messageManager;
	return messageManager;
}

/**
 * Publishes an order or kill switch event for the audit chain (ADR-0064 §3).
 * Fire and forget, never throws: a refused event is logged as an error and the
 * order flow does not wait for the bus (the log line is the fallback record).
 */
export function publishRiskEvent(
	event: string,
	fields: Record<string, unknown>
): void {
	const topic = BUS_EVENTS[event];
	if (!topic) {
		return;
	}
	try {
		const metadata = new HELPER.metadataBuilder(toTopic(topic), topic, {
			instanceId: toInstanceId(ENV.INSTANCE_ID),
			serviceName: toServiceId(ServiceInstanceName.RiskExecutionService),
		})
			.setDelivery({ mode: DeliveryMode.AtLeastOnce })
			.toJSON();
		_messageManager()
			.post.indirect(fields, metadata)
			.catch((error: unknown) => _logRefused(topic, fields, error));
	} catch (error) {
		_logRefused(topic, fields, error);
	}
}

function _logRefused(topic: string, fields: unknown, error: unknown): void {
	getLogger().error("risk event not published: the audit trail misses it", {
		topic,
		fields,
		error: normalizeError(error),
	});
}
