import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { type Db, MongoClient } from "mongodb";
import {
	MongoAuditChainReader,
	MongoChainState,
} from "../../src/adapters/outbound/persistence/audit-chain-reader";
import {
	type AuditEventDocument,
	AuditRepository,
} from "../../src/adapters/outbound/persistence/audit-repository";
import { ChainAudit } from "../../src/application/audit-chain/chain-audit";
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

/** No gap, no duplicate chainSequence, and the verifier accepts the chain. */
async function expectIntactChain(db: Db, expected: number): Promise<void> {
	const seqs = (
		await db
			.collection("audit_events")
			.find({}, { projection: { chainSequence: 1 } })
			.sort({ chainSequence: 1 })
			.toArray()
	).map((d) => d.chainSequence);
	expect(seqs).toEqual(Array.from({ length: expected }, (_, i) => i + 1));
	const audit = new ChainAudit({
		reader: new MongoAuditChainReader(db),
		state: new MongoChainState(db),
		anchors: null,
		retentionMs: 1827 * 86_400_000,
		metrics: { verified: () => undefined, anchored: () => undefined },
	});
	const report = await audit.verify("full");
	expect(report).toMatchObject({ broken: null });
}

describe("audit chain contention between writers (issue #496)", () => {
	let client: MongoClient;
	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});
	afterAll(async () => {
		await client.close();
	});

	it.each([1, 2, 5])(
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
			expect(failed).toBe(0);
			expect(exhausted).toBe(0);
			expect(stored).toBe(n * PER_WRITER);
			await expectIntactChain(db, n * PER_WRITER);
		},
		120000
	);

	it("keeps the chain intact when a holder freezes past the lease TTL (ADR-0052)", async () => {
		const db = client.db(`audit-frozen-${Date.now()}`);
		const frozen = new AuditRepository(db);
		const other = new AuditRepository(db);
		await frozen.ensureIndexes();
		const leases = db.collection("audit_chain_lease");

		// The frozen holder takes the lease, then stalls before its insertMany.
		const events = db.collection("audit_events");
		let thaw: () => void = () => undefined;
		const stalled = new Promise<void>((resolve) => {
			thaw = resolve;
		});
		const realInsertMany = (
			frozen as unknown as { _collection: { insertMany: (...a: any[]) => any } }
		)._collection;
		const original = realInsertMany.insertMany.bind(realInsertMany);
		realInsertMany.insertMany = async (...args: any[]) => {
			await stalled;
			return original(...args);
		};
		const frozenWrite = frozen.insert(doc("frozen-0", 0));
		for (let i = 0; i < 100 && !(await leases.findOne({})); i++) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		// Simulates LEASE_TTL_MS elapsing: the lease is expired.
		await leases.updateOne(
			{ _id: "head" as never },
			{ $set: { expiresAt: new Date(0) } }
		);

		await Promise.all([1, 2, 3].map((i) => other.insert(doc(`other-${i}`, i))));
		expect(await events.countDocuments()).toBe(3);

		// The stale holder wakes up: its stale tail collides, it must not fork.
		thaw();
		await frozenWrite;
		expect(await events.countDocuments()).toBe(4);
		await expectIntactChain(db, 4);
	}, 60000);
});
