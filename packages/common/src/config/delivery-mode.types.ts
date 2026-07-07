/**
 * Delivery mode
 *
 * @description
 * Enumerates possible **message delivery semantics** supported by the broker.
 * Controls retry and acknowledgement behavior for subscribers.
 */

/** Runtime delivery mode constants for use in comparisons and schema validation. */
export const DeliveryMode = {
	AT_MOST_ONCE: "at-most-once",
	AT_LEAST_ONCE: "at-least-once",
	EXACTLY_ONCE: "exactly-once",
} as const;

/** Union type of all delivery modes */
export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];
