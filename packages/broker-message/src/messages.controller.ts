import { getLogger } from "@trading-model/contracts/logger-registry";
import { runWithCorrelationId } from "@trading-model/http/correlation-id";
import { CorrelationId } from "@trading-model/primitives/primitives";
import { MESSAGE_PAYLOAD_SCHEMA } from "./shared/barrel/message.schema";

/** Delivered `messageId`s remembered per process: bounds the memory of the dedup. */
export const DELIVERED_IDS_MAX = 10_000;

// A Set iterates in insertion order: the first entry is the oldest.
// shortcut: per process, lost on restart and not shared between replicas; a shared store when a consumer has side effects.
const deliveredIds = new Set<string>();

/** A message as the subscriber's handler receives it. */
export interface DeliveredMessage {
	metadata: { topic: string; messageId?: string; correlationId?: string };
	payload?: unknown;
}

/**
 * Hands a delivered message to the subscriber's handler. The payload schema
 * depends on the topic, so it is checked here. The bus delivers at least once:
 * a `messageId` already handled is not handled again.
 *
 * @returns false when the payload does not match the schema of its topic.
 */
export async function deliverToHandler(
	{ metadata, payload }: DeliveredMessage,
	handle: (message: DeliveredMessage, signal?: AbortSignal) => Promise<void>,
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

	// The handler runs in the message's correlation context: its logs and outgoing calls carry it.
	const run = () => handle({ metadata, payload }, signal);
	await (metadata.correlationId
		? runWithCorrelationId(CorrelationId.of(metadata.correlationId), run)
		: run());
	// Remembered only after a successful handle: a handler that throws must leave the redelivery possible.
	if (messageId) {
		deliveredIds.add(messageId);
		if (deliveredIds.size > DELIVERED_IDS_MAX) {
			deliveredIds.delete(deliveredIds.values().next().value as string);
		}
	}
	return true;
}
