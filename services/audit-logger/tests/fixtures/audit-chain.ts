import {
	type ChainAnchor,
	type ChainedAuditEvent,
	computeAuditHash,
} from "../../src/domain/audit-chain";

/**
 * A valid chain of `count` events from `first`, as audit-logger stores them.
 * Odd sequences have no correlationId; with `legacy`, it is stored as null
 * (events written before 2026-10-31). `tag` makes other events with the same
 * sequences.
 */
export function chainOf(
	count: number,
	{ first = 1, previousHash = "", legacy = false, tag = "" } = {}
): ChainedAuditEvent[] {
	const events: ChainedAuditEvent[] = [];
	let previous = previousHash;
	for (
		let chainSequence = first;
		chainSequence < first + count;
		chainSequence++
	) {
		const withCorrelation = chainSequence % 2 === 0;
		const metadata = {
			topic: "market.data",
			messageId: `msg-${chainSequence}`,
			...(withCorrelation ? { correlationId: `corr-${chainSequence}` } : {}),
		};
		const event = {
			receivedAt: new Date(Date.UTC(2026, 9, 31, 12, 0, chainSequence)),
			metadata,
			payload: { price: 65000.5 + chainSequence, levels: [1, 2.5], tag },
			previousHash: previous,
			chainSequence,
		};
		const dataHash = computeAuditHash(event);
		const stored =
			legacy && !withCorrelation
				? { ...event, metadata: { ...metadata, correlationId: null } }
				: event;
		events.push({ ...stored, dataHash });
		previous = dataHash;
	}
	return events;
}

export function anchorOf(
	event: ChainedAuditEvent,
	anchoredAt = new Date("2026-10-31T13:00:00Z")
): ChainAnchor {
	return {
		chainSequence: event.chainSequence,
		dataHash: event.dataHash,
		anchoredAt,
	};
}
