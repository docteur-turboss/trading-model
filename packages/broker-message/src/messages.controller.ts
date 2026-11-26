import { getLogger } from "@trading-model/contracts/logger-registry";
import { runWithCorrelationId } from "@trading-model/http/correlation-id";
import { CorrelationId } from "@trading-model/primitives/primitives";
import { MESSAGES_UNKNOWN_TOPIC_TOTAL } from "./bus/metrics";
import {
	EVENT_VALIDATORS,
	MESSAGE_PAYLOAD_SCHEMA,
} from "./shared/barrel/message.schema";

// One warning per topic and process; the counter carries the volume.
// shortcut: unbounded, topics come from internal producers; cap it if a producer can mint topics.
const unknownTopicsWarned = new Set<string>();

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
 * @returns false when the payload does not match the schema of its known topic;
 * true for an unknown topic, acknowledged and ignored.
 */
export async function deliverToHandler(
	{ metadata, payload }: DeliveredMessage,
	handle: (message: DeliveredMessage, signal?: AbortSignal) => Promise<void>,
	signal?: AbortSignal
): Promise<boolean> {
	// Expand/contract (ADR-0040): a topic added by release N is not dead-lettered at an N-1 subscriber.
	if (!Object.keys(EVENT_VALIDATORS).includes(metadata.topic)) {
		MESSAGES_UNKNOWN_TOPIC_TOTAL.inc({ topic: metadata.topic });
		if (!unknownTopicsWarned.has(metadata.topic)) {
			unknownTopicsWarned.add(metadata.topic);
			getLogger().warn("Unknown topic acknowledged and ignored", {
				topic: metadata.topic,
			});
		}
		return true;
	}

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
