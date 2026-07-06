/**
 * DeliveryModeEnum
 *
 * @description
 * Enumerates possible **message delivery semantics** supported by the broker.
 * Controls retry and acknowledgement behavior for subscribers.
 */

/** Union type of all delivery modes */
export type DeliveryModeEnum =
	| "at-most-once"
	| "at-least-once"
	| "exactly-once";

export enum DeliveryMode {
	/** Deliver messages at most once (no retries) */
	AT_MOST_ONCE = "at-most-once",

	/** Deliver messages at least once (retry until ACK or TTL) */
	AT_LEAST_ONCE = "at-least-once",

	/** Deliver messages exactly once (idempotent delivery) */
	EXACTLY_ONCE = "exactly-once",
}
