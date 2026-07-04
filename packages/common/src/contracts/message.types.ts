/**
 * @file message.types.ts
 *
 * @description
 * Canonical message contract definitions shared across the messaging system.
 * This is the single source of truth for message envelope types, metadata,
 * routing, delivery, and security contracts.
 *
 * @responsability
 * - Define the canonical message envelope structure
 * - Standardize message metadata across all services
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
 */

import type { DeliveryModeEnum } from "../config/delivery-mode.types";
import type { ServiceInstanceName } from "../config/services.types";

/**
 * Identity of a service instance within the broker system.
 * Used to identify publishers and subscribers for routing and load-balancing.
 */
export interface ServiceIdentity {
	/** Logical name of the emitting service. */
	serviceName: ServiceInstanceName;

	/** Unique instance identifier (pod / container). */
	instanceId: string;

	/** Deployment region for geo-affinity routing. */
	region?: string;
}

/**
 * Routing hints for message delivery scheduling.
 */
export interface RoutingType {
	/** Ensures ordering for a given business key. */
	partitionKey?: string;

	/** Monotonically increasing sequence number per partition key. */
	sequenceNumber?: number;

	/** Influences delivery scheduling priority. */
	priority?: number;
}

/**
 * Delivery settings applied to a message.
 */
export interface DeliveryType {
	/** Delivery semantics to apply. */
	mode: DeliveryModeEnum;

	/** Message expiration in milliseconds. */
	ttl?: number;

	/** Identifier used to prevent duplicate processing. */
	deduplicationId?: string;
}

/**
 * Security context attached to a message.
 */
export interface SecurityType {
	/** Authentication / authorization context. */
	authContext?: {
		subject: string;
		roles: string[];
		tenantId: string;
	};

	/** Message integrity signature. */
	signature?: string;
}

/**
 * Configuration object for TLS-secured broker connections.
 * Contains file paths to certificates required for mutual TLS authentication.
 */
export interface BrokerConfig {
	/** Path to the Root CA certificate. */
	rootCACertPath: string;

	/** Path to the client certificate. */
	certificatePath: string;

	/** Path to the client key. */
	keyCertificatePath: string;
}

/**
 * Message envelope combining business payload with technical metadata
 * for routing, delivery, and traceability.
 *
 * @template T - Type of the business payload.
 */
export interface Message<TData = unknown> {
	/** Technical and routing metadata. */
	metadata: MessageMetadata;

	/** Business data carried by the message. */
	payload: TData;
}

/**
 * Technical metadata associated with a message, including identification,
 * routing, delivery constraints, and security context.
 */
export interface MessageMetadata {
	/** Identifier used to correlate messages belonging to the same logical flow. */
	correlationId?: string;

	/** Version of the payload schema. */
	schemaVersion: string;

	/** Identifier of the message that caused this one. */
	causationId?: string;

	/** Unique message identifier. */
	messageId?: string;

	/** Business event name (e.g. UserCreated). */
	eventType: string;

	/** Timestamp indicating when the message was emitted. */
	emittedAt?: Date;

	/** Logical routing channel. */
	topic: string;

	/** Identity of the message publisher. */
	publisher: ServiceIdentity;

	/** Optional routing hints. */
	routing?: RoutingType;

	/** Optional delivery constraints. */
	delivery?: DeliveryType;

	/** Optional security context. */
	security?: SecurityType;
}
