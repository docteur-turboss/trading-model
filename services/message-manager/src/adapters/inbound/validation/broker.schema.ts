import {
	DELIVERY_METADATA_MODE_PREDICATE,
	ROUTING_METADATA_CONTEXT_PREDICATE,
	SECURITY_METADATA_CONTEXT_PREDICATE,
	TRACEPARENT_METADATA_PREDICATE,
} from "@trading-model/broker-message/shared/barrel/message.schema";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { EventEnumMap } from "@trading-model/contracts/event-map";
import {
	toCorrelationId,
	toInstanceId,
	toMessageId,
	toServiceId,
	toTopic,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { z } from "zod";

const TOPIC_SCHEMA = z.string().min(1).transform(toTopic);
const CALLBACK_PATH_SCHEMA = z.string().min(1);
const INSTANCE_ID_SCHEMA = z.string().min(1).transform(toInstanceId);

const IDENTIFY_SCHEMA = z.object({
	serviceName: z
		.enum(
			Object.values(ServiceInstanceName) as [
				ServiceInstanceName,
				...ServiceInstanceName[],
			]
		)
		.transform(toServiceId),
	instanceId: INSTANCE_ID_SCHEMA,
});

export const SUBSCRIBE_SCHEMA = z.object({
	topic: TOPIC_SCHEMA,
	callbackPath: CALLBACK_PATH_SCHEMA,
	serviceIdentity: IDENTIFY_SCHEMA,
});

export const UNSUBSCRIBE_SCHEMA = z.object({
	topic: TOPIC_SCHEMA,
	instanceId: INSTANCE_ID_SCHEMA,
});

export const PUBLISH_METADATA_SCHEMA = z.object({
	correlationId: z
		.string()
		.optional()
		.transform((val) => (val ? toCorrelationId(val) : undefined)),
	schemaVersion: z
		.string()
		.min(1)
		.transform(() => "1.0.0" as const),
	causationId: z
		.string()
		.optional()
		.transform((val) => (val ? toCorrelationId(val) : undefined)),
	// as unknown as: Zod string typed as the event enum
	eventType: z.string().min(1) as unknown as z.ZodType<EventEnumMap>,
	topic: TOPIC_SCHEMA,

	publisher: IDENTIFY_SCHEMA,

	routing: ROUTING_METADATA_CONTEXT_PREDICATE,

	delivery: DELIVERY_METADATA_MODE_PREDICATE,

	security: SECURITY_METADATA_CONTEXT_PREDICATE,

	traceparent: TRACEPARENT_METADATA_PREDICATE,
});

export const PUBLISH_SCHEMA = z.object({
	payload: z.unknown(),
	metadata: PUBLISH_METADATA_SCHEMA,
});

/**
 * Replay of a dead letter to one service (ADR-0043): the stored message, with
 * the `messageId` and `emittedAt` it was stamped with.
 */
export const REPUBLISH_SCHEMA = z.object({
	service: z.string().min(1),
	message: z.object({
		payload: z.unknown(),
		metadata: PUBLISH_METADATA_SCHEMA.extend({
			messageId: z.string().min(1).transform(toMessageId),
			emittedAt: z.number().int().nonnegative().transform(UnixTimestamp.of),
		}),
	}),
});
