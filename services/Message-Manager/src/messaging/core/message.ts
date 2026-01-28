/**
 * @file message.ts
 *
 * @description
 * Message contract definitions used by the messaging system.
 *
 * This file defines the structure of messages exchanged through the broker,
 * including both the business payload and the technical metadata required
 * for routing, delivery, and observability.
 *
 * These interfaces are pure data contracts and contain no logic.
 *
 * @responsability
 * - Define the canonical message envelope structure
 * - Standardize message metadata across the system
 * - Provide strong typing for message producers and consumers
 *
 * @restrictions
 * - This file must not contain any runtime logic
 * - Interfaces must remain backward-compatible when possible
 * - No side effects or validation are performed here
 *
 * @architecture
 * Messaging / contract layer.
 * Shared data model used across producers, broker, and consumers.
 *
 * @author docteur-turboss
 *
 * @version
 * 1.0.0
 *
 * @since
 * 2026.01.28
 */

import { DeliveryModeEnum } from "../broker.type";
import { IdentifyType } from "../broker.type";

/**
 * Message envelope.
 *
 * @description
 * Represents a message exchanged through the messaging system.
 * Combines business payload with technical metadata required
 * for routing, delivery, and traceability.
 *
 * @template T
 * Type of the business payload.
 */
export interface message<T = unknown> {
  /**
   * Technical and routing metadata.
   */
  metadata: MessageMetadata;

  /**
   * Business data carried by the message.
   */
  payload: T;
}

/**
 * Message metadata definition.
 *
 * @description
 * Contains all technical information associated with a message,
 * including identification, routing, delivery constraints,
 * and security context.
 */
export interface MessageMetadata {
  /**
   * Identifier used to correlate multiple messages
   * belonging to the same logical flow.
   */
  correlationId?: string;

  /**
   * Version of the payload schema.
   */
  schemaVersion: string;

  /**
   * Identifier of the message that caused this one.
   */
  causationId?: string;

  /**
   * Unique message identifier.
   */
  messageId: string;

  /**
   * Business event name (e.g. UserCreated).
   */
  eventType: string;

  /**
   * Timestamp indicating when the message was emitted.
   */
  emittedAt: Date;

  /**
   * Logical routing channel.
   */
  topic: string;

  /**
   * Identity of the message publisher.
   */
  publisher: IdentifyType;

  /**
   * Optional routing hints.
   */
  routing?: {
    /**
     * Ensures ordering for a given business key.
     */
    partitionKey?: string;

    /**
     * Influences delivery scheduling priority.
     */
    priority?: number;
  };

  /**
   * Optional delivery constraints.
   */
  delivery?: {
    /**
     * Delivery semantics to apply.
     */
    mode: DeliveryModeEnum;

    /**
     * Message expiration in milliseconds.
     */
    ttl?: number;

    /**
     * Identifier used to prevent duplicate processing.
     */
    deduplicationId?: string;
  };

  /**
   * Optional security context.
   */
  security?: {
    /**
     * Authentication / authorization context.
     */
    authContext?: unknown;

    /**
     * Message integrity signature.
     */
    signature?: string;
  };
}