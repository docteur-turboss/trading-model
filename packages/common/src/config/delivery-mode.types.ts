/**
 * Delivery mode
 *
 * @description
 * Enumerates possible **message delivery semantics** supported by the broker.
 * Controls retry and acknowledgement behavior for subscribers.
 */

/** Union type of all delivery modes */
export type DeliveryMode =
	| "at-most-once"
	| "at-least-once"
	| "exactly-once";

/** Runtime delivery mode constants for use in comparisons and schema validation. */
export const DeliveryMode: {
	AT_MOST_ONCE: DeliveryMode;
	AT_LEAST_ONCE: DeliveryMode;
	EXACTLY_ONCE: DeliveryMode;
} = {
	AT_MOST_ONCE: "at-most-once",
	AT_LEAST_ONCE: "at-least-once",
	EXACTLY_ONCE: "exactly-once",
};
