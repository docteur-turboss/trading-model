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
import { metrics } from "./metrics";

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
		const metadata = new HELPER.metadataBuilder(toTopic(event), event, {
			instanceId: toInstanceId(ENV.INSTANCE_ID),
			serviceName: toServiceId(ServiceInstanceName.DlqService),
		})
			.setDelivery({
				mode: DeliveryMode.AtLeastOnce,
				deduplicationId: toMessageId(randomUUID()),
			})
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
