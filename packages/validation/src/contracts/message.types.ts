/**
 * Canonical message envelope contracts. Single source of truth for type-safe
 * messaging types shared across all services. No runtime logic.
 */

import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type {
	CorrelationId,
	DurationMs,
	MessageId,
	MessagePriority,
	Role,
	SequenceNumber,
	Subject,
	TenantId,
	Topic,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity as DomainServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { Signature } from "./signed-request";

/**
 * Identity of a service instance within the broker system.
 * Used to identify publishers and subscribers for routing and load-balancing.
 */
export type ServiceIdentity = DomainServiceIdentity;

/**
 * Routing hints for message delivery scheduling.
 */
export interface RoutingType {
	/** Ensures ordering for a given business key. */
	partitionKey?: CorrelationId;

	/** Monotonically increasing sequence number per partition key. */
	sequenceNumber?: SequenceNumber;

	/** Influences delivery scheduling priority. */
	priority?: MessagePriority;
}

/**
 * Delivery settings applied to a message.
 */
export interface DeliveryType {
	mode: DeliveryMode;

	/** Message expiration in milliseconds. */
	ttl?: DurationMs;

	/** Identifier used to prevent duplicate processing. */
	deduplicationId?: MessageId;
}

/**
 * Security context attached to a message.
 */
export interface AuthContext {
	subject: Subject;
	roles: Role[];
	tenantId: TenantId;
}

export interface SecurityType {
	authContext?: AuthContext;
	signature?: Signature;
}

/**
 * Message envelope combining business payload with technical metadata
 * for routing, delivery, and traceability.
 *
 * @template T - Type of the business payload.
 */
export interface Message<TData = unknown> {
	metadata: MessageMetadata;
	payload: TData;
}

/**
 * Technical metadata associated with a message, including identification,
 * routing, delivery constraints, and security context.
 */
export interface MessageMetadata {
	/** Identifier used to correlate messages belonging to the same logical flow. */
	correlationId?: CorrelationId;

	/** Version of the payload schema. */
	schemaVersion: "1.0.0";

	/** Identifier of the message that caused this one. */
	causationId?: CorrelationId;

	/** Unique message identifier. */
	messageId?: MessageId;

	/** Business event name (e.g. UserCreated). */
	eventType: EventEnumMap;

	/** Timestamp indicating when the message was emitted. */
	emittedAt?: UnixTimestamp;

	/** Logical routing channel. */
	topic: Topic;

	/** Identity of the message publisher. */
	publisher: ServiceIdentity;

	/** Optional routing hints. */
	routing?: RoutingType;

	/** Optional delivery constraints. */
	delivery?: DeliveryType;

	/** Optional security context. */
	security?: SecurityType;
}
