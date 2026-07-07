/** Maximum consecutive errors before an entry is abandoned. */
export const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

/** Maximum times an entry can pass through the DLQ (ping-pong detection). */
export const DLQ_MAX_PASS_COUNT = 3;

/** MongoDB projection fields used when claiming entries. */
export const CLAIM_PROJECTION = {
	_id: 1,
	topic: 1,
	message: 1,
	reason: 1,
	deliveryAttempt: 1,
	createdAt: 1,
} as const;
