import { randomUUID } from "node:crypto";
import type BusClient from "@trading-model/broker-message";
import { HELPER } from "@trading-model/broker-message";
import { createServiceBusClient } from "@trading-model/broker-message/create-message-manager";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { RiskEvent } from "@trading-model/contracts/risk-events";
import {
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { type PendingRiskEvent, RiskOutbox } from "../application/risk-outbox";
import type { StatePort } from "../domain/ports";
import { ENV } from "../infrastructure/config/env";
import { RISK_OUTBOX_DROPPED, RISK_OUTBOX_PENDING } from "./metrics";

/** Domain events that go on the bus; the others (`broker.error`, ...) stay in the log. */
const BUS_EVENTS: Record<string, RiskEvent> = {
	"order.transition": RiskEvent.OrderTransitioned,
	"kill_switch.engaged": RiskEvent.KillSwitchEngaged,
	"kill_switch.rearmed": RiskEvent.KillSwitchRearmed,
};

type MessageManager = BusClient;

let messageManager: MessageManager | undefined;

/** Built on first use: the bus journal in Redis (ADR-0073), with the service's ACL user. */
function _messageManager(): MessageManager {
	messageManager ??= createServiceBusClient(ENV);
	return messageManager;
}

async function _send({ topic, fields }: PendingRiskEvent): Promise<void> {
	const metadata = new HELPER.metadataBuilder(Topic.of(topic), topic, {
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: ServiceId.of(ServiceInstanceName.RiskExecutionService),
	})
		.setDelivery({ mode: DeliveryMode.AtLeastOnce })
		.toJSON();
	await _messageManager().publish(fields, metadata);
}

/** Wires the outbox to the bus, the metrics and its file, then replays what a previous run kept. */
export async function createRiskOutbox(
	store: StatePort<PendingRiskEvent[]>
): Promise<RiskOutbox> {
	const outbox = new RiskOutbox({
		store,
		send: _send,
		setPending: (depth) => RISK_OUTBOX_PENDING.set(depth),
		onDropped: () => RISK_OUTBOX_DROPPED.inc(),
	});
	await outbox.init();
	return outbox;
}

/**
 * Publishes an order or kill switch event for the audit chain (ADR-0064 §3).
 * Never throws; a refused event is kept by the outbox and replayed with the
 * same `eventId`, so a copy accepted before a timeout can be told apart.
 */
export function publishRiskEvent(
	outbox: RiskOutbox,
	event: string,
	fields: Record<string, unknown>
): void {
	const topic = BUS_EVENTS[event];
	if (topic) {
		outbox.publish({ topic, fields: { ...fields, eventId: randomUUID() } });
	}
}
