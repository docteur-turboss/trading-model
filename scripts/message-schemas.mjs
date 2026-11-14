#!/usr/bin/env bun
// =============================================================================
//  message-schemas.mjs — versioned JSON Schema snapshot of the bus messages
//  (ADR-0061).
//
//    (default)  fail when docs/services/events/schemas.json is not up to date
//    --write    regenerate it from EVENT_VALIDATORS (Zod 4 toJSONSchema)
//    --compat   fail on a breaking change against the snapshot of the last
//               release tag (vX.Y.Z[-rc.N]) holding a snapshot; none =
//               nothing to compare, success. Intentional break: put the exact
//               reported line in docs/services/events/breaking-exceptions.json.
//
//  Usage: bun run contracts:check | contracts:write | contracts:compat
// =============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { breakingChanges, releaseTags } from "./schema-compat.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const SNAPSHOT = "docs/services/events/schemas.json";
const EXCEPTIONS = join(ROOT, "docs/services/events/breaking-exceptions.json");

// zod is a dependency of broker-message, not of the root.
const { z } = createRequire(join(ROOT, "packages/broker-message/package.json"))("zod");
const { EVENT_VALIDATORS } = await import(
	join(ROOT, "packages/broker-message/src/domain/messages/schemas/message-payload.schema.ts")
);

const snapshot = {};
for (const type of Object.keys(EVENT_VALIDATORS).sort()) {
	snapshot[type] = z.toJSONSchema(EVENT_VALIDATORS[type], { unrepresentable: "any", io: "input" });
}
const generated = `${JSON.stringify(snapshot, null, "\t")}\n`;
const mode = process.argv[2] ?? "";

/** Snapshot of the newest release tag (pre-releases included) that has one, or undefined. */
function previousSnapshot() {
	const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	// versionsort.suffix=- sorts v3.1.0-rc.1 before v3.1.0.
	const tags = releaseTags(git("-c", "versionsort.suffix=-", "tag", "--list", "v*", "--sort=-v:refname"));
	for (const tag of tags) {
		try {
			const schemas = JSON.parse(git("show", `${tag}:${SNAPSHOT}`));
			console.log(`contracts:compat: comparing with ${tag}`);
			return { tag, schemas };
		} catch {
			console.log(`contracts:compat: ${tag} has no ${SNAPSHOT}, trying the previous tag`);
		}
	}
	console.log("contracts:compat: no release tag with a snapshot, nothing to compare");
	return undefined;
}

if (mode === "--write") {
	writeFileSync(join(ROOT, SNAPSHOT), generated);
	console.log(`${SNAPSHOT} written (${Object.keys(snapshot).length} events)`);
} else if (mode === "--compat") {
	const previous = previousSnapshot();
	if (previous) {
		const allowed = new Set(existsSync(EXCEPTIONS) ? JSON.parse(readFileSync(EXCEPTIONS, "utf8")).map((e) => e.break) : []);
		const failures = Object.entries(previous.schemas)
			.flatMap(([type, old]) =>
				type in snapshot
					? breakingChanges(old, snapshot[type]).map((b) => `${type} ${b}`)
					: [`${type} $: event removed`]
			)
			.filter((b) => !allowed.has(b));
		if (failures.length) {
			console.error(`contracts:compat: breaking changes against ${previous.tag}:\n  ${failures.join("\n  ")}`);
			console.error('Intentional? Add {"break": "<exact line>", "reason": "..."} to docs/services/events/breaking-exceptions.json (ADR-0061).');
			process.exit(1);
		}
		console.log(`contracts:compat: compatible with ${previous.tag}`);
	}
} else if (!existsSync(join(ROOT, SNAPSHOT)) || readFileSync(join(ROOT, SNAPSHOT), "utf8") !== generated) {
	console.error(`${SNAPSHOT} is out of date: run \`bun run contracts:write\``);
	process.exit(1);
} else console.log(`${SNAPSHOT} up to date`);
