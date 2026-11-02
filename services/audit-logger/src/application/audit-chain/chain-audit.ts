import { getLogger } from "@trading-model/contracts/logger-registry";
import {
	applicableAnchors,
	type ChainAnchor,
	type ChainLossAcknowledgement,
	type ChainPoint,
	type ChainVerification,
	ChainVerifier,
} from "../../domain/audit-chain";
import type {
	AnchorStorePort,
	AuditChainReaderPort,
	ChainAuditMetricsPort,
	ChainStatePort,
} from "../../domain/ports/audit-chain.port";

/** Margin on the retention: the TTL monitor deletes expired events late. */
const EXPIRY_GRACE_MS = 86_400_000;

export interface ChainAuditDeps {
	reader: AuditChainReaderPort;
	state: ChainStatePort;
	/** Null when no anchor store is configured: the chain is verified only. */
	anchors: AnchorStorePort | null;
	/** AUDIT_RETENTION_DAYS, in milliseconds. */
	retentionMs: number;
	metrics: ChainAuditMetricsPort;
	now?: () => Date;
}

export interface ChainReport {
	generatedAt: string;
	anchoringEnabled: boolean;
	head: ChainPoint | null;
	verification: ChainVerification;
	anchors: {
		count: number;
		first: ChainAnchor | null;
		last: ChainAnchor | null;
	};
	acknowledgements: ChainLossAcknowledgement[];
}

/**
 * Verifies the audit trail and anchors its verified head (ADR-0027). Each
 * cycle resumes from the last verified point; only a verified head is
 * anchored, so an anchor always vouches for a chain that held.
 */
export class ChainAudit {
	private readonly _now: () => Date;

	constructor(private readonly _deps: ChainAuditDeps) {
		this._now = _deps.now ?? (() => new Date());
	}

	get anchoringEnabled(): boolean {
		return this._deps.anchors !== null;
	}

	/** One scheduled cycle: verify the new events, then anchor the head. */
	async runCycle(): Promise<ChainVerification> {
		const verification = await this.verify("incremental");
		if (!verification.broken) {
			await this.anchor();
		}
		return verification;
	}

	/**
	 * `incremental` resumes from the last verified point and moves it forward;
	 * `full` walks every event left and leaves the checkpoint as it is.
	 */
	async verify(mode: "incremental" | "full"): Promise<ChainVerification> {
		const { reader, state, metrics } = this._deps;
		const saved = await state.load();
		const start = mode === "incremental" ? saved.verified : null;
		const result = await this._walk(start);
		metrics.verified(result.verifiedUpTo, result.broken !== null);
		if (result.broken) {
			getLogger().error("Audit chain broken", {
				broken: result.broken,
				verifiedUpTo: result.verifiedUpTo?.chainSequence ?? null,
				head: (await reader.head())?.chainSequence ?? null,
			});
		} else if (mode === "incremental") {
			await state.save({ ...saved, verified: result.verifiedUpTo });
		}
		return result;
	}

	/** Anchors the verified head when it moved since the last anchor. */
	async anchor(): Promise<void> {
		const { anchors, state, metrics } = this._deps;
		if (!anchors) {
			return;
		}
		const saved = await state.load();
		const head = saved.verified;
		if (
			head &&
			(!saved.anchored ||
				saved.anchored.chainSequence !== head.chainSequence ||
				saved.anchored.dataHash !== head.dataHash)
		) {
			await anchors.write(head);
			await state.save({ ...saved, anchored: head });
		}
		metrics.anchored(head);
	}

	/**
	 * Records that the events from `fromSequence` on were lost (restore from
	 * an older backup), so the anchors written for them before now stop
	 * failing the verification. The record is itself immutable and listed in
	 * every report.
	 */
	async acknowledgeLoss(fromSequence: number, reason: string): Promise<void> {
		if (!this._deps.anchors) {
			throw new Error(
				"No anchor store configured: there is no anchor to acknowledge"
			);
		}
		await this._deps.anchors.acknowledgeLoss(fromSequence, reason);
		getLogger().warn("Audit chain loss acknowledged", { fromSequence, reason });
	}

	/** Full verification with what an auditor needs to judge it. */
	async report(): Promise<ChainReport> {
		const { reader, anchors } = this._deps;
		const verification = await this.verify("full");
		const all = anchors ? await anchors.anchorsAfter(null) : [];
		return {
			generatedAt: this._now().toISOString(),
			anchoringEnabled: anchors !== null,
			head: await reader.head(),
			verification,
			anchors: {
				count: all.length,
				first: all[0] ?? null,
				last: all[all.length - 1] ?? null,
			},
			acknowledgements: anchors ? await anchors.acknowledgements() : [],
		};
	}

	private async _walk(start: ChainPoint | null): Promise<ChainVerification> {
		const { reader, anchors, retentionMs } = this._deps;
		if (start) {
			const head = await reader.head();
			if (!head || head.chainSequence < start.chainSequence) {
				return {
					verifiedUpTo: start,
					count: 0,
					broken: `the trail ends at ${head?.chainSequence ?? "nothing"}, before the verified sequence ${start.chainSequence}: events were removed`,
				};
			}
		}
		const anchorList = anchors
			? applicableAnchors(
					await anchors.anchorsAfter(start?.chainSequence ?? null),
					await anchors.acknowledgements()
				)
			: [];
		const verifier = new ChainVerifier({
			start,
			anchors: anchorList,
			expiredBefore: new Date(
				this._now().getTime() - retentionMs + EXPIRY_GRACE_MS
			),
		});
		for await (const event of reader.eventsAfter(
			start?.chainSequence ?? null
		)) {
			if (!verifier.check(event)) {
				break;
			}
		}
		return verifier.finish();
	}
}
