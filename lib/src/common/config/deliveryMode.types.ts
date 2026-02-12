/**
 * DeliveryModeEnum
 * 
 * @description
 * Enumerates possible **message delivery semantics** supported by the broker.
 * Controls retry and acknowledgement behavior for subscribers.
 */
export const DeliveryMode = {
  /** Deliver messages at most once (no retries) */
  AT_MOST_ONCE: 'at-most-once',

  /** Deliver messages at least once (retry until ACK or TTL) */
  AT_LEAST_ONCE: 'at-least-once',

  /** Deliver messages exactly once (idempotent delivery) */
  EXACTLY_ONCE: 'exactly-once'
} as const;

type DeliveryModeObj = typeof DeliveryMode;

/** Union type of all delivery modes */
export type DeliveryModeEnum = DeliveryModeObj[keyof DeliveryModeObj];
