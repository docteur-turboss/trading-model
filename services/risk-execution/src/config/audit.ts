import { randomUUID } from "node:crypto";
import { HELPER } from "@trading-model/broker-message";
import { createMessageManager } from "@trading-model/broker-message/create-message-manager";
import { parseServiceName } from "@trading-model/common/config/services.types";
import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DeliveryMode } from "@trading-model/contracts/delivery-mode";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { RiskEvent } from "@trading-model/contracts/risk-events";
import {
	InstanceId,
	ServiceId,
	Topic,
} from "@trading-model/primitives/primitives";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import type { StatePort } from "../domain/ports";
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
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: parseServiceName(ENV.SERVICE_NAME),
		callbackPath: ENV.MESSAGE_CALLBACK_PATH,
	}).messageManager;
	return messageManager;
}

interface Pending {
	topic: RiskEvent;
	fields: Record<string, unknown>;
}

/** Bound of the waiting file: the oldest event is dropped (and logged) beyond it. */
const MAX_PENDING = 1000;

let store: StatePort<Pending[]> | undefined;
let pending: Pending[] = [];
let chain: Promise<void> = Promise.resolve();

/** Runs outbox changes one at a time: the file is rewritten whole. */
function _serial(task: () => Promise<void>): Promise<void> {
	chain = chain
		.then(task)
		.catch((error: unknown) =>
			getLogger().error("risk outbox failed", { error: normalizeError(error) })
		);
	return chain;
}

async function _send({ topic, fields }: Pending): Promise<void> {
	const metadata = new HELPER.metadataBuilder(Topic.of(topic), topic, {
		instanceId: InstanceId.of(ENV.INSTANCE_ID),
		serviceName: ServiceId.of(ServiceInstanceName.RiskExecutionService),
	})
		.setDelivery({ mode: DeliveryMode.AtLeastOnce })
		.toJSON();
	await _messageManager().post.indirect(fields, metadata);
}

async function _drain(): Promise<void> {
	const before = pending.length;
	while (pending[0]) {
		try {
			await _send(pending[0]);
		} catch (error) {
			getLogger().warn("risk outbox replay stopped", {
				pending: pending.length,
				error: normalizeError(error),
			});
			break;
		}
		pending.shift();
	}
	if (pending.length !== before) {
		await store?.save(pending);
	}
}

async function _enqueue(entry: Pending): Promise<void> {
	pending.push(entry);
	if (pending.length > MAX_PENDING) {
		getLogger().error("risk outbox full: oldest event dropped", {
			dropped: pending.shift(),
		});
	}
	getLogger().warn("risk event kept for replay", { pending: pending.length });
	await store?.save(pending);
}

/**
 * Loads the events kept by a previous run and replays them. Throws when the
 * file cannot be read: starting on an empty queue would overwrite it.
 */
export async function initRiskOutbox(
	file: StatePort<Pending[]>
): Promise<void> {
	store = file;
	pending = (await file.load()) ?? [];
	await _serial(_drain);
}

/** Replays the waiting events (startup, tick); never throws. */
export function replayRiskEvents(): Promise<void> {
	return _serial(_drain);
}

/**
 * Publishes an order or kill switch event for the audit chain (ADR-0064 §3).
 * Never throws and the order flow does not wait for the bus. A refused event is
 * kept in the outbox file and replayed (next success, tick, restart) with the
 * same `eventId`, so a copy accepted before a timeout can be told apart.
 */
export function publishRiskEvent(
	event: string,
	fields: Record<string, unknown>
): void {
	const topic = BUS_EVENTS[event];
	if (!topic) {
		return;
	}
	const entry = { topic, fields: { ...fields, eventId: randomUUID() } };
	_send(entry).then(
		() => (pending.length > 0 ? replayRiskEvents() : undefined),
		(error: unknown) => {
			_logRefused(topic, fields, error);
			return _serial(() => _enqueue(entry));
		}
	);
}

function _logRefused(topic: string, fields: unknown, error: unknown): void {
	getLogger().error("risk event not published: kept in the outbox", {
		topic,
		fields,
		error: normalizeError(error),
	});
}
