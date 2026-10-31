import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ChainAudit } from "../../../src/application/audit-chain/chain-audit";
import type {
	ChainAnchor,
	ChainedAuditEvent,
	ChainLossAcknowledgement,
	ChainPoint,
} from "../../../src/domain/audit-chain";
import type {
	AnchorStorePort,
	ChainState,
} from "../../../src/domain/ports/audit-chain.port";
import { chainOf } from "../../fixtures/audit-chain";

const NOW = new Date("2026-10-31T14:00:00Z");
const DAY = 86_400_000;

class FakeTrail {
	events: ChainedAuditEvent[] = [];
	async *eventsAfter(after: number | null) {
		yield* this.events.filter((e) => after === null || e.chainSequence > after);
	}
	async head(): Promise<ChainPoint | null> {
		const last = this.events[this.events.length - 1];
		return last ? point(last) : null;
	}
}

class FakeState {
	state: ChainState = { verified: null, anchored: null };
	async load() {
		return { ...this.state };
	}
	async save(state: ChainState) {
		this.state = state;
	}
}

class FakeAnchors implements AnchorStorePort {
	anchors: ChainAnchor[] = [];
	acks: ChainLossAcknowledgement[] = [];
	at = NOW;
	async write(p: ChainPoint) {
		this.anchors.push({ ...p, anchoredAt: this.at });
	}
	async anchorsAfter(after: number | null) {
		return this.anchors.filter(
			(a) => after === null || a.chainSequence > after
		);
	}
	async acknowledgements() {
		return this.acks;
	}
	async acknowledgeLoss(fromSequence: number, reason: string) {
		this.acks.push({ fromSequence, reason, acknowledgedAt: this.at });
	}
}

function point(event: ChainedAuditEvent): ChainPoint {
	return { chainSequence: event.chainSequence, dataHash: event.dataHash };
}

describe("ChainAudit", () => {
	let trail: FakeTrail;
	let state: FakeState;
	let anchors: FakeAnchors;
	const metrics = { verified: jest.fn(), anchored: jest.fn() };

	function audit(withAnchors = true) {
		return new ChainAudit({
			reader: trail,
			state,
			anchors: withAnchors ? anchors : null,
			retentionMs: 1827 * DAY,
			metrics,
			now: () => NOW,
		});
	}

	beforeEach(() => {
		trail = new FakeTrail();
		state = new FakeState();
		anchors = new FakeAnchors();
		metrics.verified.mockReset();
		metrics.anchored.mockReset();
	});

	it("verifies, moves the checkpoint and anchors the verified head", async () => {
		trail.events = chainOf(3);

		const result = await audit().runCycle();

		expect(result.broken).toBeNull();
		expect(state.state).toEqual({
			verified: point(trail.events[2]),
			anchored: point(trail.events[2]),
		});
		expect(anchors.anchors.map((a) => a.chainSequence)).toEqual([3]);
		expect(metrics.verified).toHaveBeenCalledWith(
			point(trail.events[2]),
			false
		);
		expect(metrics.anchored).toHaveBeenCalledWith(point(trail.events[2]));
	});

	it("resumes from the checkpoint and anchors only a head that moved", async () => {
		trail.events = chainOf(3);
		await audit().runCycle();
		await audit().runCycle();
		expect(anchors.anchors).toHaveLength(1);

		trail.events = chainOf(5);
		const result = await audit().runCycle();

		expect(result.count).toBe(2);
		expect(anchors.anchors.map((a) => a.chainSequence)).toEqual([3, 5]);
	});

	it("keeps the checkpoint and anchors nothing when the chain is broken", async () => {
		trail.events = chainOf(3);
		await audit().runCycle();
		const next = chainOf(5);
		next[3] = { ...next[3], payload: "changed" };
		trail.events = next;

		const result = await audit().runCycle();

		expect(result.broken).toMatch(/^chainSequence 4: dataHash/);
		expect(state.state.verified?.chainSequence).toBe(3);
		expect(anchors.anchors).toHaveLength(1);
		expect(metrics.verified).toHaveBeenLastCalledWith(
			point(trail.events[2]),
			true
		);
	});

	it("detects a rewrite of the whole chain through the anchors", async () => {
		trail.events = chainOf(4);
		await audit().runCycle();
		// Rewritten from the start, every hash recomputed, checkpoint cleared.
		trail.events = chainOf(4, { previousHash: "forged" });
		state.state = { verified: null, anchored: null };

		expect((await audit().runCycle()).broken).toBe(
			"chainSequence 4: differs from the anchor of 2026-10-31T14:00:00.000Z"
		);
	});

	it("detects a trail that ends before the checkpoint", async () => {
		trail.events = chainOf(4);
		await audit().runCycle();
		trail.events = chainOf(2);

		expect((await audit().runCycle()).broken).toBe(
			"the trail ends at 2, before the verified sequence 4: events were removed"
		);
	});

	it("accepts a restore once its loss is acknowledged", async () => {
		trail.events = chainOf(5);
		await audit().runCycle();
		// Restore of an older backup: checkpoint and events back at 3.
		trail.events = chainOf(3);
		state.state = {
			verified: point(trail.events[2]),
			anchored: point(trail.events[2]),
		};
		expect((await audit().runCycle()).broken).toMatch(/anchor 5 .* beyond/);

		// New events reuse sequences 4 and 5 with other hashes.
		trail.events.push(
			...chainOf(2, {
				first: 4,
				previousHash: trail.events[2].dataHash,
				tag: "after restore",
			})
		);
		expect((await audit().runCycle()).broken).toMatch(
			/^chainSequence 5: differs from the anchor/
		);

		anchors.at = new Date(NOW.getTime() + 60_000);
		await audit().acknowledgeLoss(4, "restore of 2026-10-31");

		expect((await audit().runCycle()).broken).toBeNull();
		expect(state.state.anchored?.chainSequence).toBe(5);
		// The anchor 5 of before the restore stays; the new 5 is added.
		expect(anchors.anchors).toHaveLength(2);
	});

	it("only verifies without an anchor store", async () => {
		trail.events = chainOf(2);
		const unanchored = audit(false);

		expect(unanchored.anchoringEnabled).toBe(false);
		expect((await unanchored.runCycle()).broken).toBeNull();
		expect(metrics.anchored).not.toHaveBeenCalled();
		await expect(unanchored.acknowledgeLoss(1, "x")).rejects.toThrow(
			"No anchor store configured"
		);
	});

	it("reports a full verification with the anchors, checkpoint untouched", async () => {
		trail.events = chainOf(3);
		await audit().runCycle();
		trail.events = chainOf(4);
		state.state = { ...state.state };

		const report = await audit().report();

		expect(report).toMatchObject({
			generatedAt: NOW.toISOString(),
			anchoringEnabled: true,
			head: point(trail.events[3]),
			verification: { count: 4, broken: null },
			anchors: { count: 1, first: { chainSequence: 3 } },
			acknowledgements: [],
		});
		expect(state.state.verified?.chainSequence).toBe(3);
		expect((await audit(false).report()).anchors.count).toBe(0);
	});
});
