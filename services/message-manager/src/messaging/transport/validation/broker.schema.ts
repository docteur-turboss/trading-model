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

import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toCorrelationId, toMessageId, toTopic } from "@trading-model/common/domain/primitives";
import { z } from "zod";

/**
 * @description
 * Shared primitive validators for topics, callback paths, and instance IDs
 */
const TOPIC_SCHEMA = z.string().min(1);
const CALLBACK_PATH_SCHEMA = z.string().min(1);
const INSTANCE_ID_SCHEMA = z.string().min(1);

/**
 * @description
 * Schema for identifying a service instance in the broker
 */
const IDENTIFY_SCHEMA = z.object({
	serviceName: z.enum(
		Object.values(ServiceInstanceName) as [
			ServiceInstanceName,
			...ServiceInstanceName[],
		]
	),
	instanceId: INSTANCE_ID_SCHEMA,
});

/**
 * @description
 * Schema for subscribing to a topic
 */
export const SUBSCRIBE_SCHEMA = z.object({
	topic: TOPIC_SCHEMA,
	callbackPath: CALLBACK_PATH_SCHEMA,
	consumerIdentity: IDENTIFY_SCHEMA,
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
	correlationId: z.string().optional().transform((v) => (v ? toCorrelationId(v) : undefined)),
	schemaVersion: z.string().min(1),
	causationId: z.string().optional().transform((v) => (v ? toCorrelationId(v) : undefined)),
	eventType: z.string().min(1),
	topic: TOPIC_SCHEMA.transform(toTopic),

	publisher: IDENTIFY_SCHEMA,

	routing: z
		.object({
			partitionKey: z.string().optional().transform((v) => (v ? toCorrelationId(v) : undefined)),
			priority: z.number().int().optional(),
		})
		.optional(),

	delivery: z
		.object({
			mode: z.enum(
				Object.values(DeliveryMode) as [DeliveryMode, ...DeliveryMode[]]
			),
			ttl: z.number().int().positive().optional(),
			deduplicationId: z.string().optional().transform((v) => (v ? toMessageId(v) : undefined)),
		})
		.optional(),

	security: z
		.object({
			authContext: z
				.object({
					subject: z.string(),
					roles: z.array(z.string()),
					tenantId: z.string(),
				})
				.optional(),
			signature: z.string().optional(),
		})
		.optional(),
});

/**
 * @description
 * Schema for publishing a message, including payload and metadata
 */
export const PUBLISH_SCHEMA = z.object({
	payload: z.unknown(),
	metadata: PUBLISH_METADATA_SCHEMA,
});
