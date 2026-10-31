import type {
	ChainAnchor,
	ChainedAuditEvent,
	ChainLossAcknowledgement,
	ChainPoint,
} from "../audit-chain";

/** Reads the stored audit trail (ADR-0027). */
export interface AuditChainReaderPort {
	/** Events after `afterSequence` (every event when null), in sequence order. */
	eventsAfter(afterSequence: number | null): AsyncIterable<ChainedAuditEvent>;
	/** The newest event, or null when the trail is empty. */
	head(): Promise<ChainPoint | null>;
}

/** How far the chain was verified and anchored. Stored with the trail. */
export interface ChainState {
	verified: ChainPoint | null;
	anchored: ChainPoint | null;
}

export interface ChainStatePort {
	load(): Promise<ChainState>;
	save(state: ChainState): Promise<void>;
}

/** Chain heads kept where nobody can rewrite them (S3 Object Lock). */
export interface AnchorStorePort {
	write(point: ChainPoint): Promise<void>;
	/** Anchors of the sequences after `afterSequence` (all when null). */
	anchorsAfter(afterSequence: number | null): Promise<ChainAnchor[]>;
	acknowledgements(): Promise<ChainLossAcknowledgement[]>;
	acknowledgeLoss(fromSequence: number, reason: string): Promise<void>;
}

/** What a verification and an anchoring pass report. */
export interface ChainAuditMetricsPort {
	verified(upTo: ChainPoint | null, broken: boolean): void;
	anchored(point: ChainPoint | null): void;
}
