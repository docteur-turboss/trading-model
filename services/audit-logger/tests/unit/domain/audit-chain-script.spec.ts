import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "@jest/globals";
import {
	type ChainedAuditEvent,
	ChainVerifier,
} from "../../../src/domain/audit-chain";
import { chainOf } from "../../fixtures/audit-chain";

/** The mongosh verifier of the restore drills and auditors. */
const SCRIPT = readFileSync(
	join(__dirname, "../../../../../tests/backup/audit-chain.js"),
	"utf8"
);

/** Runs tests/backup/audit-chain.js on `events`, with a minimal mongosh `db`. */
function runScript(events: ChainedAuditEvent[]): {
	broken: string | null;
	count: number;
} {
	const printed: string[] = [];
	const db = {
		getSiblingDB: () => ({
			audit_events: {
				find: () => ({
					sort: () => ({
						forEach: (fn: (event: ChainedAuditEvent) => void) => {
							for (const event of [...events].sort(
								(left, right) => left.chainSequence - right.chainSequence
							)) {
								fn(event);
							}
						},
					}),
				}),
			},
		}),
	};
	runInContext(
		`const AUDIT_DB = "audit"; ${SCRIPT}`,
		createContext({ db, require, print: (line: string) => printed.push(line) })
	);
	return JSON.parse(printed[0]);
}

function runVerifier(events: ChainedAuditEvent[]) {
	const verifier = new ChainVerifier({
		start: null,
		anchors: [],
		expiredBefore: new Date(0),
	});
	for (const event of events) {
		if (!verifier.check(event)) {
			break;
		}
	}
	return verifier.finish();
}

const CASES: Record<string, () => ChainedAuditEvent[]> = {
	valid: () => chainOf(6),
	"legacy null correlationId": () => chainOf(6, { legacy: true }),
	"expired head": () => chainOf(6).slice(2),
	"missing event": () =>
		chainOf(6).filter((event) => event.chainSequence !== 3),
	"broken link": () =>
		chainOf(4).map((event) =>
			event.chainSequence === 3 ? { ...event, previousHash: "x" } : event
		),
	"changed payload": () =>
		chainOf(4).map((event) =>
			event.chainSequence === 2 ? { ...event, payload: { price: 1 } } : event
		),
};

describe("tests/backup/audit-chain.js", () => {
	it.each(Object.keys(CASES))("judges %s like ChainVerifier", (name) => {
		const events = CASES[name]();
		const script = runScript(events);
		const verifier = runVerifier(events);

		expect(script.broken).toBe(verifier.broken);
		expect(script.count).toBe(verifier.count);
	});
});
