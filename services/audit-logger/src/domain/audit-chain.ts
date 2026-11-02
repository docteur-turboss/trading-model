import { createHash } from "node:crypto";

/**
 * The audit trail is a hash chain (ADR-0027): each event carries the sha256 of
 * its content and of the previous event's hash, and a contiguous sequence.
 */

/** What the hash of an event covers. */
export interface HashedAuditContent {
	receivedAt: Date;
	metadata: object;
	payload: unknown;
	previousHash: string;
	chainSequence: number;
}

/** An event as read back from the store. */
export interface ChainedAuditEvent extends HashedAuditContent {
	dataHash: string;
}

/** A position in the chain: a sequence and the hash of the event there. */
export interface ChainPoint {
	chainSequence: number;
	dataHash: string;
}

/** A chain head written to the anchor store, which nobody can rewrite. */
export interface ChainAnchor extends ChainPoint {
	/** Set by the anchor store, not by the writer. */
	anchoredAt: Date;
}

/**
 * An operator's record that the events from `fromSequence` on were lost
 * (restore from an older backup): anchors written before it for those
 * sequences no longer apply. Kept in the anchor store, so it cannot be
 * removed either, and listed in every report.
 */
export interface ChainLossAcknowledgement {
	fromSequence: number;
	reason: string;
	acknowledgedAt: Date;
}

export function computeAuditHash(content: HashedAuditContent): string {
	return createHash("sha256")
		.update(
			JSON.stringify(content, (_key, value) =>
				typeof value === "bigint" ? value.toString() : value
			)
		)
		.digest("hex");
}

/**
 * The content the hash of a stored event was computed on. Events stored
 * before 2026-10-31 hold `correlationId: null` where the hash saw no field
 * (undefined, skipped by JSON.stringify); the builder never hashes a null
 * correlationId, so null always means absent.
 */
export function hashedContentOf(event: ChainedAuditEvent): HashedAuditContent {
	const metadata = { ...(event.metadata as Record<string, unknown>) };
	if (metadata.correlationId === null) {
		delete metadata.correlationId;
	}
	return {
		receivedAt: event.receivedAt,
		metadata,
		payload: event.payload,
		previousHash: event.previousHash,
		chainSequence: event.chainSequence,
	};
}

/** The anchors that still apply once the acknowledged losses are taken out. */
export function applicableAnchors(
	anchors: readonly ChainAnchor[],
	acknowledgements: readonly ChainLossAcknowledgement[]
): ChainAnchor[] {
	return anchors.filter(
		(anchor) =>
			!acknowledgements.some(
				(ack) =>
					anchor.chainSequence >= ack.fromSequence &&
					anchor.anchoredAt.getTime() < ack.acknowledgedAt.getTime()
			)
	);
}

export interface ChainVerification {
	/** Last event verified, or the start point when no event followed it. */
	verifiedUpTo: ChainPoint | null;
	/** Events verified by this run. */
	count: number;
	/** First fault found; null when the chain holds. */
	broken: string | null;
}

export interface ChainVerifierOptions {
	/** Last verified point to resume from; null walks from the oldest event. */
	start: ChainPoint | null;
	anchors: readonly ChainAnchor[];
	/**
	 * Events anchored before this date may have expired (TTL). An anchor more
	 * recent than it, for a sequence older than the oldest event left, means
	 * events were removed before their retention ended.
	 */
	expiredBefore: Date;
}

/**
 * Walks events in sequence order. Started from a verified point, the first
 * event must follow it; started from nothing, the first event is the anchor of
 * the walk (older events may have expired). Every anchor in the range must
 * match the event at its sequence, no anchor may lie beyond the last event,
 * and none too recent to have expired may lie before the first one: either
 * would mean events were removed.
 */
export class ChainVerifier {
	private readonly _anchors: Map<number, ChainAnchor>;
	private readonly _expiredBefore: number;
	private readonly _resumed: boolean;
	private _last: ChainPoint | null;
	private _count = 0;
	private _broken: string | null = null;

	constructor({ start, anchors, expiredBefore }: ChainVerifierOptions) {
		this._last = start;
		this._resumed = start !== null;
		this._expiredBefore = expiredBefore.getTime();
		this._anchors = new Map(
			anchors
				.filter(
					(anchor) => !start || anchor.chainSequence > start.chainSequence
				)
				.map((anchor) => [anchor.chainSequence, anchor])
		);
	}

	/** Checks the next event; returns false once the chain is broken. */
	check(event: ChainedAuditEvent): boolean {
		if (this._broken) {
			return false;
		}
		const last = this._last;
		if (!last && this._removedBefore(event.chainSequence)) {
			return false;
		}
		if (last && event.chainSequence !== last.chainSequence + 1) {
			return this._fail(
				`chainSequence ${last.chainSequence + 1} missing (next is ${event.chainSequence})`
			);
		}
		if (last && event.previousHash !== last.dataHash) {
			return this._fail(
				`chainSequence ${event.chainSequence}: previousHash is not the dataHash of ${last.chainSequence}`
			);
		}
		if (computeAuditHash(hashedContentOf(event)) !== event.dataHash) {
			return this._fail(
				`chainSequence ${event.chainSequence}: dataHash does not match the stored content`
			);
		}
		const anchor = this._anchors.get(event.chainSequence);
		if (anchor && anchor.dataHash !== event.dataHash) {
			return this._fail(
				`chainSequence ${event.chainSequence}: differs from the anchor of ${anchor.anchoredAt.toISOString()}`
			);
		}
		this._anchors.delete(event.chainSequence);
		this._last = {
			chainSequence: event.chainSequence,
			dataHash: event.dataHash,
		};
		this._count++;
		return true;
	}

	finish(): ChainVerification {
		if (!(this._broken || this._last || this._resumed)) {
			this._removedBefore(Number.POSITIVE_INFINITY);
		}
		if (!this._broken && this._last) {
			const lastSequence = this._last.chainSequence;
			const beyond = [...this._anchors.values()]
				.filter((anchor) => anchor.chainSequence > lastSequence)
				.sort((left, right) => left.chainSequence - right.chainSequence)[0];
			if (beyond) {
				this._fail(
					`anchor ${beyond.chainSequence} (${beyond.anchoredAt.toISOString()}) lies beyond the last event ${lastSequence}: events were removed`
				);
			}
		}
		return {
			verifiedUpTo: this._last,
			count: this._count,
			broken: this._broken,
		};
	}

	/** Fails on an unexpired anchor older than `firstSequence`. */
	private _removedBefore(firstSequence: number): boolean {
		const removed = [...this._anchors.values()]
			.filter(
				(anchor) =>
					anchor.chainSequence < firstSequence &&
					anchor.anchoredAt.getTime() >= this._expiredBefore
			)
			.sort((left, right) => right.chainSequence - left.chainSequence)[0];
		if (!removed) {
			return false;
		}
		this._fail(
			`anchor ${removed.chainSequence} (${removed.anchoredAt.toISOString()}) is too recent to have expired, but its event is gone: events were removed`
		);
		return true;
	}

	private _fail(reason: string): false {
		this._broken = reason;
		return false;
	}
}
