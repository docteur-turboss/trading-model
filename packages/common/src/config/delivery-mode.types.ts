/**
 * Delivery mode
 *
 * @description
 * Enumerates possible **message delivery semantics** supported by the broker.
 * Controls retry and acknowledgement behavior for subscribers.
 */

export enum DeliveryMode {
	AtMostOnce = "at-most-once",
	AtLeastOnce = "at-least-once",
	ExactlyOnce = "exactly-once",
}
