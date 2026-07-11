import { PositiveInt } from "@trading-model/common/domain/primitives";

/** Maximum consecutive errors before an entry is abandoned. */
export const DLQ_MAX_CONSECUTIVE_ERRORS = PositiveInt.of(3);

/** Maximum times an entry can pass through the DLQ (ping-pong detection). */
export const DLQ_MAX_PASS_COUNT = PositiveInt.of(3);

/** MongoDB projection fields used when claiming entries. */
export const CLAIM_PROJECTION = {
	_id: 1 as const,
	topic: 1 as const,
	message: 1 as const,
	reason: 1 as const,
	deliveryAttempt: 1 as const,
	createdAt: 1 as const,
} as const;
