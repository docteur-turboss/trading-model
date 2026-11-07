import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { MongoClient } from "mongodb";
import {
	type AuditEventDocument,
	AuditRepository,
} from "../../src/adapters/outbound/persistence/audit-repository";
import { CHAIN_COLLISIONS_TOTAL } from "../../src/config/metrics";

const PER_WRITER = 40;

function doc(id: string, i: number): AuditEventDocument {
	return {
		receivedAt: new Date(Date.UTC(2026, 10, 7, 12, 0, i)),
		metadata: {
			messageId: id,
			emittedAt: new Date(Date.UTC(2026, 10, 7, 12, 0, i)).toISOString(),
			publisher: { serviceName: "financial-scraper", instanceId: "fs-1" },
		},
		payload: { i },
	} as unknown as AuditEventDocument;
}

async function counter(outcome: string): Promise<number> {
	const m = await CHAIN_COLLISIONS_TOTAL.get();
	return m.values.find((v) => v.labels.outcome === outcome)?.value ?? 0;
}

describe("audit chain contention between writers (issue #496)", () => {
	let client: MongoClient;
	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});
	afterAll(async () => {
		await client.close();
	});

	it.each([2, 5])(
		"measures retries and failures with %i writers",
		async (n) => {
			const db = client.db(`audit-contention-${n}-${Date.now()}`);
			const repos = Array.from({ length: n }, () => new AuditRepository(db));
			await repos[0].ensureIndexes();
			const retried0 = await counter("retried");
			const exhausted0 = await counter("exhausted");
			const started = Date.now();
			const results = await Promise.allSettled(
				repos.flatMap((r, w) =>
					Array.from({ length: PER_WRITER }, (_, i) =>
						r.insert(doc(`w${w}-${i}`, i))
					)
				)
			);
			const ms = Date.now() - started;
			const failed = results.filter((r) => r.status === "rejected").length;
			const stored = await db.collection("audit_events").countDocuments();
			const retries = (await counter("retried")) - retried0;
			const exhausted = (await counter("exhausted")) - exhausted0;
			console.info(
				`MEASURE writers=${n} events=${n * PER_WRITER} stored=${stored} failed=${failed} retries=${retries} exhausted=${exhausted} ms=${ms} eps=${Math.round((stored * 1000) / ms)}`
			);
			expect(failed).toBe(exhausted);
			expect(stored).toBe(n * PER_WRITER - failed);
		},
		120000
	);
});
