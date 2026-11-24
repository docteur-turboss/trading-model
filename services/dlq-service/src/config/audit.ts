import { HELPER } from "@trading-model/broker-message";
import { createMessageManager } from "@trading-model/broker-message/create-message-manager";
import { parseServiceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	DlqEvent,
	DlqEventMap,
} from "@trading-model/contracts/dlq-events";
import {
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";
import { logger } from "./logger";
import { metrics } from "./metrics";

type MessageManager = ReturnType<typeof createMessageManager>["messageManager"];

let messageManager: MessageManager | undefined;

/** Built on first use: the broker client loads the SVID. */
function _messageManager(): MessageManager {
	// No journal: the dlq-service Redis ACL user has no right on the bus streams (retired in N+1).
	messageManager ??= createMessageManager({
		addressManagerClient: AddressManager,
		tlsPaths: buildTlsFromEnv(ENV),
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: parseServiceName(ENV.SERVICE_NAME),
		callbackPath: ENV.MESSAGE_CALLBACK_PATH,
	}).messageManager;
	return messageManager;
}

/**
 * Publishes a DLQ event on the bus, where audit-logger records it like every
 * topic. Never rejects: resolves true once message-manager has journaled it
 * (202, ADR-0048), false when it did not, after an error log and
 * `dlq_audit_publish_failures_total{event}`. The human actions (delete,
 * manual replay) wait for it and report a refused event (ADR-0059); the
 * others do not wait, so a DLQ request never depends on the bus.
 */
export async function publishDlqEvent<TEvent extends DlqEvent>(
	event: TEvent,
	payload: DlqEventMap[TEvent]
): Promise<boolean> {
	try {
		const metadata = new HELPER.metadataBuilder(Topic.of(event), event, {
			instanceId: InstanceId.of(ENV.INSTANCE_ID),
			serviceName: ServiceId.of(ServiceInstanceName.DlqService),
		})
			.setDelivery({ mode: DeliveryMode.AtLeastOnce })
			.toJSON();
		await _messageManager().post.indirect(payload, metadata);
		return true;
	} catch (err: unknown) {
		metrics.auditPublishFailures.inc({ event });
		logger.error("DLQ event not published: the audit trail misses it", {
			topic: event,
			payload,
			error: normalizeError(err),
		});
		return false;
	}
}
