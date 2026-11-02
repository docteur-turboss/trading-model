// Verifies the audit-logger hash chain (mongosh script, used by the restore
// drills). Set AUDIT_DB (and optionally UP_TO, the last chainSequence to
// check) before this file, e.g. mongosh --eval "const AUDIT_DB='audit'; <this file>".
// Each event must follow the previous one (chainSequence + 1), carry its
// dataHash as previousHash, and its dataHash must be the sha256 of its stored
// content. Same rules as ChainVerifier in
// services/audit-logger/src/domain/audit-chain.ts (audit-chain-script.spec.ts
// feeds both the same events), without the anchors: the offline tool for
// auditors and the restore drills.
// Prints {count, first, last, digest, broken}: digest covers every dataHash in
// order, broken is the first fault found (null when the chain holds). The
// oldest events expire (TTL), so the chain is anchored on the first one left.
(() => {
	const crypto = require("crypto");
	const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
	const filter = typeof UP_TO === "number" ? { chainSequence: { $lte: UP_TO } } : {};
	const digest = crypto.createHash("sha256");
	let count = 0;
	let first = null;
	let expected = null;
	let previous = null;
	let broken = null;
	db.getSiblingDB(AUDIT_DB)
		.audit_events.find(filter)
		.sort({ chainSequence: 1 })
		.forEach((event) => {
			if (broken) return;
			if (first === null) {
				first = event.chainSequence;
				expected = first;
				previous = event.previousHash;
			}
			if (event.chainSequence !== expected) {
				broken = `chainSequence ${expected} missing (next is ${event.chainSequence})`;
				return;
			}
			if (event.previousHash !== previous) {
				broken = `chainSequence ${expected}: previousHash is not the dataHash of ${expected - 1}`;
				return;
			}
			// Events stored before 2026-10-31 hold correlationId: null where the
			// hash saw no field (undefined, skipped by JSON.stringify). The
			// builder never hashes a null correlationId, so null always means
			// absent: drop it to recompute the hash those events were given.
			const metadata = { ...event.metadata };
			if (metadata.correlationId === null) delete metadata.correlationId;
			const content = JSON.stringify({
				receivedAt: event.receivedAt,
				metadata,
				payload: event.payload,
				previousHash: event.previousHash,
				chainSequence: event.chainSequence,
			});
			if (sha256(content) !== event.dataHash) {
				broken = `chainSequence ${expected}: dataHash does not match the stored content`;
				return;
			}
			digest.update(event.dataHash);
			previous = event.dataHash;
			expected++;
			count++;
		});
	print(
		JSON.stringify({
			count,
			first,
			last: expected === null ? null : expected - 1,
			digest: digest.digest("hex"),
			broken,
		})
	);
})();
