/**
 * Delivery mode
 *
 * @description
 * Enumerates possible **message delivery semantics** supported by the broker.
 * Controls retry and acknowledgement behavior for subscribers.
 */

export enum DeliveryMode {
	AT_MOST_ONCE = "at-most-once",
	AT_LEAST_ONCE = "at-least-once",
	EXACTLY_ONCE = "exactly-once",
}
