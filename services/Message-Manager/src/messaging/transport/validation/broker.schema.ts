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
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.28
 */

import { ServiceInstanceName } from "cash-lib/config/services.types";
import { DeliveryMode } from "messaging/broker.type";
import { z } from "zod";

/**
 * @description
 * Shared primitive validators for topics, callback paths, and instance IDs
 */
const TopicSchema = z.string().min(1);
const CallbackPathSchema = z.string().min(1);
const InstanceIdSchema = z.string().min(1);

/**
 * @description
 * Schema for identifying a service instance in the broker
 */
const IdentifySchema = z.object({
  serviceName: z.enum(Object.keys(ServiceInstanceName) as [
    keyof typeof ServiceInstanceName,
    ...(keyof typeof ServiceInstanceName)[]
  ]),
  instanceId: InstanceIdSchema,
});

/**
 * @description
 * Schema for subscribing to a topic
 */
export const SubscribeSchema = z.object({
  topic: TopicSchema,
  callbackPath: CallbackPathSchema,
  consumerIdentity: IdentifySchema,
});

/**
 * @description
 * Schema for unsubscribing from a topic
 */
export const UnsubscribeSchema = z.object({
  topic: TopicSchema,
  instanceId: InstanceIdSchema,
});

/**
 * @description
 * Schema for the metadata portion of published messages
 */
export const PublishMetadataSchema = z.object({
  correlationId: z.string().optional(),
  schemaVersion: z.string().min(1),
  causationId: z.string().optional(),
  messageId: z.string().min(1),
  eventType: z.string().min(1),
  topic: TopicSchema,

  publisher: IdentifySchema,

  routing: z.object({
    partitionKey: z.string().optional(),
    priority: z.number().int().optional(),
  }).optional(),

  delivery: z.object({
    mode: z.enum(DeliveryMode),
    ttl: z.number().int().positive().optional(),
    deduplicationId: z.string().optional(),
  }).optional(),

  security: z.object({
    authContext: z.unknown().optional(),
    signature: z.string().optional(),
  }).optional(),
});

/**
 * @description
 * Schema for publishing a message, including payload and metadata
 */
export const PublishSchema = z.object({
  payload: z.unknown(),
  metadata: PublishMetadataSchema,
});
