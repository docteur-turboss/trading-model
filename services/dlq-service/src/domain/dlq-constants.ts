import { PUBLISH_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import { PositiveInt } from "@trading-model/primitives/primitives";

/**
 * One replayed `POST /message`: message-manager answers once every
 * subscriber acknowledged, dead-lettered or gave up (ADR-0019). Waiting less
 * than that answer and sending again would publish the entry twice, each copy
 * with a new messageId.
 */
export const REPLAY_DELIVERY_TIMEOUT_MS = PUBLISH_TIMEOUT_MS + 5000;

/** A replay batch starts no delivery after this delay; those in flight finish. */
export const REPLAY_BATCH_TIMEOUT_MS = 120_000;

/**
 * A claim older than this cannot belong to a delivery still in flight (the
 * last one starts before the batch timeout and lasts at most the delivery
 * timeout): its instance died, the entry may be claimed again.
 */
export const STALE_CLAIM_MS =
	REPLAY_BATCH_TIMEOUT_MS + REPLAY_DELIVERY_TIMEOUT_MS + 60_000;

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
