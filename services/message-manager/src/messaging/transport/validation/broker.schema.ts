/**
 * @file broker.schema.ts
 *
 * @description
 * Defines the **Zod validation schemas** used for the message broker module.
 * Includes schemas for subscribing, unsubscribing, publishing messages, and
 * validating message metadata.
 *
 * @responsability
 * - Validate input data for broker operations (subscribe, unsubscribe, publish)
 * - Ensure correct types for message metadata and payload
 * - Prevent invalid or malformed data from entering the broker
 *
 * @restrictions
 * - Purely a validation layer; does not perform any side effects
 * - Only enforces structural and basic semantic correctness
 *
 * @architecture
 * Utility module used by the broker layer.
 * Acts as a **data contract enforcement** component.
 */

import {
	DELIVERY_METADATA_MODE_PREDICATE,
	ROUTING_METADATA_CONTEXT_PREDICATE,
	SECURITY_METADATA_CONTEXT_PREDICATE,
} from "@trading-model/broker-message/shared/barrel/message.schema";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	toCorrelationId,
	toInstanceId,
	toServiceId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import { z } from "zod";

const TOPIC_SCHEMA = z.string().min(1).transform(toTopic);
const CALLBACK_PATH_SCHEMA = z.string().min(1);
const INSTANCE_ID_SCHEMA = z.string().min(1).transform(toInstanceId);

/**
 * @description
 * Schema for identifying a service instance in the broker
 */
const IDENTIFY_SCHEMA = z.object({
	serviceName: z
		.enum(
			Object.values(ServiceInstanceName) as [
				ServiceInstanceName,
				...ServiceInstanceName[],
			]
		)
		.transform(toServiceId),
	instanceId: INSTANCE_ID_SCHEMA.transform(toInstanceId),
});

/**
 * @description
 * Schema for subscribing to a topic
 */
export const SUBSCRIBE_SCHEMA = z.object({
	topic: TOPIC_SCHEMA,
	callbackPath: CALLBACK_PATH_SCHEMA,
	serviceIdentity: IDENTIFY_SCHEMA,
});

/**
 * @description
 * Schema for unsubscribing from a topic
 */
export const UNSUBSCRIBE_SCHEMA = z.object({
	topic: TOPIC_SCHEMA,
	instanceId: INSTANCE_ID_SCHEMA,
});

/**
 * @description
 * Schema for the metadata portion of published messages
 */
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
	eventType: z.string().min(1) as unknown as z.ZodType<EventEnumMap>,
	topic: TOPIC_SCHEMA.transform(toTopic),

	publisher: IDENTIFY_SCHEMA,

	routing: ROUTING_METADATA_CONTEXT_PREDICATE,

	delivery: DELIVERY_METADATA_MODE_PREDICATE,

	security: SECURITY_METADATA_CONTEXT_PREDICATE,
});

/**
 * @description
 * Schema for publishing a message, including payload and metadata
 */
export const PUBLISH_SCHEMA = z.object({
	payload: z.unknown(),
	metadata: PUBLISH_METADATA_SCHEMA,
});
