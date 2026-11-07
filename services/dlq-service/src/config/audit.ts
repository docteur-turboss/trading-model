import { randomUUID } from "node:crypto";
import { HELPER } from "@trading-model/broker-message";
import { createServiceMessageManager } from "@trading-model/broker-message/application/services/create-message-manager";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import type {
	DlqEvent,
	DlqEventMap,
} from "@trading-model/contracts/dlq-events";
import {
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { ENV } from "../infrastructure/config/env";
import { AddressManager } from "./address-manager";
import { logger } from "./logger";

type MessageManager = ReturnType<
	typeof createServiceMessageManager
>["messageManager"];

let messageManager: MessageManager | undefined;

/** Built on first use: the broker client loads the SVID. */
function _messageManager(): MessageManager {
	messageManager ??= createServiceMessageManager(
		AddressManager,
		ENV
	).messageManager;
	return messageManager;
}

/**
 * Publishes a DLQ event on the bus, where audit-logger records it like every
 * topic. Does not wait: the DLQ request must not depend on the bus.
 */
export function publishDlqEvent<TEvent extends DlqEvent>(
	event: TEvent,
	payload: DlqEventMap[TEvent]
): void {
	const metadata = new HELPER.metadataBuilder(toTopic(event), event, {
		instanceId: toInstanceId(ENV.INSTANCE_ID),
		serviceName: toServiceId(ServiceInstanceName.DlqService),
	})
		.setDelivery({
			mode: DeliveryMode.AtLeastOnce,
			deduplicationId: toMessageId(randomUUID()),
		})
		.toJSON();
	_messageManager()
		.post.indirect(payload, metadata)
		.catch((err: unknown) => {
			logger.warn("DLQ event not published: the audit trail misses it", {
				topic: event,
				error: normalizeError(err),
			});
		});
}
