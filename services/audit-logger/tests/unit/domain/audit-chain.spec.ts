import { describe, expect, it } from "@jest/globals";
import {
	applicableAnchors,
	type ChainAnchor,
	type ChainedAuditEvent,
	ChainVerifier,
	computeAuditHash,
	hashedContentOf,
} from "../../../src/domain/audit-chain";
import { anchorOf, chainOf } from "../../fixtures/audit-chain";

const LONG_AGO = new Date("2020-01-01T00:00:00Z");

function verify(
	events: ChainedAuditEvent[],
	{
		start = null as ChainedAuditEvent | null,
		anchors = [] as ChainAnchor[],
		expiredBefore = LONG_AGO,
	} = {}
) {
	const verifier = new ChainVerifier({
		start: start && {
			chainSequence: start.chainSequence,
			dataHash: start.dataHash,
		},
		anchors,
		expiredBefore,
	});
	for (const event of events) {
		if (!verifier.check(event)) {
			break;
		}
	}
	return verifier.finish();
}

describe("ChainVerifier", () => {
	it("accepts a valid chain", () => {
		const events = chainOf(5);

		expect(verify(events)).toEqual({
			verifiedUpTo: { chainSequence: 5, dataHash: events[4].dataHash },
			count: 5,
			broken: null,
		});
	});

	it("accepts events stored before 2026-10-31 with correlationId: null", () => {
		const events = chainOf(4, { legacy: true });

		expect(events[0].metadata).toHaveProperty("correlationId", null);
		expect(verify(events).broken).toBeNull();
	});

	it("starts from the oldest event left (expired events before it)", () => {
		const events = chainOf(6).slice(2);

		expect(verify(events)).toMatchObject({ count: 4, broken: null });
	});

	it("detects a missing event", () => {
		const events = chainOf(5);
		events.splice(2, 1);

		expect(verify(events).broken).toBe("chainSequence 3 missing (next is 4)");
	});

	it("detects a broken link", () => {
		const events = chainOf(3);
		events[2] = { ...events[2], previousHash: "f".repeat(64) };

		expect(verify(events).broken).toBe(
			"chainSequence 3: previousHash is not the dataHash of 2"
		);
	});

	it("detects a changed event and stops at it", () => {
		const events = chainOf(5);
		events[1] = { ...events[1], payload: { price: 1 } };

		expect(verify(events)).toEqual({
			verifiedUpTo: { chainSequence: 1, dataHash: events[0].dataHash },
			count: 1,
			broken: "chainSequence 2: dataHash does not match the stored content",
		});
	});

	it("resumes from a verified point", () => {
		const events = chainOf(5);

		expect(verify(events.slice(3), { start: events[2] })).toMatchObject({
			count: 2,
			broken: null,
		});
		expect(verify(events.slice(4), { start: events[2] }).broken).toBe(
			"chainSequence 4 missing (next is 5)"
		);
	});

	describe("anchors", () => {
		it("accepts a chain that matches its anchors", () => {
			const events = chainOf(5);

			expect(
				verify(events, { anchors: [anchorOf(events[1]), anchorOf(events[4])] })
					.broken
			).toBeNull();
		});

		it("detects a chain rewritten and rehashed after an anchor", () => {
			const original = chainOf(5);
			const anchors = [anchorOf(original[2])];
			// Event 2 changed, then every hash after it recomputed: the chain
			// holds again, only the anchor tells.
			const rewritten = original.map((event) => ({ ...event }));
			rewritten[1] = { ...rewritten[1], payload: { price: 1 } };
			relink(rewritten);

			expect(verify(rewritten).broken).toBeNull();
			expect(verify(rewritten, { anchors }).broken).toBe(
				"chainSequence 3: differs from the anchor of 2026-10-31T13:00:00.000Z"
			);
		});

		it("detects events removed after an anchor", () => {
			const events = chainOf(5);

			expect(
				verify(events.slice(0, 3), { anchors: [anchorOf(events[4])] }).broken
			).toBe(
				"anchor 5 (2026-10-31T13:00:00.000Z) lies beyond the last event 3: events were removed"
			);
		});

		it("detects old events removed before their retention ended", () => {
			const events = chainOf(5);
			const anchors = [anchorOf(events[0])];

			expect(
				verify(events.slice(2), {
					anchors,
					expiredBefore: new Date("2026-10-01T00:00:00Z"),
				}).broken
			).toMatch(/^anchor 1 .* is too recent to have expired/);
			// Anchored before the retention limit: its event may have expired.
			expect(
				verify(events.slice(2), {
					anchors,
					expiredBefore: new Date("2026-11-01T00:00:00Z"),
				}).broken
			).toBeNull();
		});

		it("detects a trail emptied while anchors are recent", () => {
			const events = chainOf(2);

			expect(
				verify([], {
					anchors: [anchorOf(events[1])],
					expiredBefore: new Date("2026-10-01T00:00:00Z"),
				}).broken
			).toMatch(/^anchor 2 .* events were removed$/);
		});

		it("ignores the anchors up to the resume point", () => {
			const events = chainOf(5);
			const stale = { ...anchorOf(events[1]), dataHash: "0".repeat(64) };

			expect(
				verify(events.slice(3), { start: events[2], anchors: [stale] }).broken
			).toBeNull();
		});
	});
});

describe("applicableAnchors", () => {
	it("drops the anchors an acknowledged loss covers, written before it", () => {
		const before = new Date("2026-10-31T10:00:00Z");
		const after = new Date("2026-10-31T12:00:00Z");
		const anchors: ChainAnchor[] = [
			{ chainSequence: 4, dataHash: "a", anchoredAt: before },
			{ chainSequence: 9, dataHash: "b", anchoredAt: before },
			{ chainSequence: 9, dataHash: "c", anchoredAt: after },
		];
		const acks = [
			{
				fromSequence: 5,
				reason: "restore",
				acknowledgedAt: new Date("2026-10-31T11:00:00Z"),
			},
		];

		expect(
			applicableAnchors(anchors, acks).map((anchor) => anchor.dataHash)
		).toEqual(["a", "c"]);
	});
});

describe("hashedContentOf", () => {
	it("hashes a stored legacy event like it was hashed when written", () => {
		const [event] = chainOf(1, { legacy: true });

		expect(computeAuditHash(hashedContentOf(event))).toBe(event.dataHash);
	});
});

function rehash(event: ChainedAuditEvent): ChainedAuditEvent {
	const { dataHash: _ignored, ...content } = event;
	return { ...content, dataHash: computeAuditHash(content) };
}

/** Recomputes every link and hash after the first event, as a forger would. */
function relink(events: ChainedAuditEvent[]): void {
	for (let i = 1; i < events.length; i++) {
		events[i] = rehash({ ...events[i], previousHash: events[i - 1].dataHash });
	}
}
