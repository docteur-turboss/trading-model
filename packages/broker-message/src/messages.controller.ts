import type { EventMap } from "@trading-model/contracts/event-map";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { runWithCorrelationId } from "@trading-model/http/correlation-id";
import { CorrelationId } from "@trading-model/primitives/primitives";
import { type DeliveredMetadata, EVENT_MANAGER } from "./event-manager-client";
import { MESSAGE_PAYLOAD_SCHEMA } from "./shared/barrel/message.schema";

/** Delivered `messageId`s remembered per process: bounds the memory of the dedup. */
export const DELIVERED_IDS_MAX = 10_000;

// A Set iterates in insertion order: the first entry is the oldest.
// shortcut: per process, lost on restart and not shared between replicas; a shared store when a consumer has side effects.
const deliveredIds = new Set<string>();

/**
 * Hands a delivered message to the listeners of its topic. The payload schema
 * depends on the topic, so it is checked here. The bus delivers at least once:
 * a `messageId` already emitted is not emitted again.
 *
 * @returns false when the payload does not match the schema of its topic.
 */
export async function deliverToListeners(
	metadata: DeliveredMetadata,
	payload: unknown,
	signal?: AbortSignal
): Promise<boolean> {
	const resultPayload = await MESSAGE_PAYLOAD_SCHEMA.safeParseAsync({
		type: metadata.topic,
		data: payload,
	});
	if (!resultPayload.success) {
		return false;
	}

	const { messageId } = metadata;
	if (messageId && deliveredIds.has(messageId)) {
		getLogger().debug("Duplicate delivery skipped", {
			messageId,
			topic: metadata.topic,
		});
		return true;
	}

	// The payload as received (not its parsed copy), checked just above.
	// Listeners run in the message's correlation context: their logs and outgoing calls carry it.
	const emit = () =>
		EVENT_MANAGER.emit(
			metadata.topic as keyof EventMap,
			payload as never,
			metadata,
			signal
		);
	await (metadata.correlationId
		? runWithCorrelationId(CorrelationId.of(metadata.correlationId), emit)
		: emit());
	// Remembered only after a successful emit: a listener that throws must leave the redelivery possible.
	if (messageId) {
		deliveredIds.add(messageId);
		if (deliveredIds.size > DELIVERED_IDS_MAX) {
			deliveredIds.delete(deliveredIds.values().next().value as string);
		}
	}
	return true;
}
