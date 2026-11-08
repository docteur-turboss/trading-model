import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { MongoClient } from "mongodb";
import { AuditRepository } from "../../src/adapters/outbound/persistence/audit-repository";

/** `AUDIT_SCALE_EVENTS=1000000` reproduces the 10^6 measurement of issue #566. */
const EVENTS = Number(process.env.AUDIT_SCALE_EVENTS ?? 100_000);
const BATCH = 10_000;
const T0 = Date.UTC(2026, 0, 1);

async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
	const start = performance.now();
	const result = await run();
	return [result, Math.round(performance.now() - start)];
}

describe("AuditRepository reads at scale — real MongoDB", () => {
	let client: MongoClient;

	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});

	afterAll(async () => {
		await client.close();
	});

	it("should serve stats and an unfiltered page without scanning the collection", async () => {
		const db = client.db(`audit-scale-${Date.now()}`);
		const repository = new AuditRepository(db);
		await repository.ensureIndexes();
		const events = db.collection("audit_events");
		for (let from = 0; from < EVENTS; from += BATCH) {
			await events.insertMany(
				Array.from({ length: Math.min(BATCH, EVENTS - from) }, (_, k) => {
					const i = from + k;
					return {
						receivedAt: new Date(T0 + i * 1000),
						ttl: new Date(T0 + 3650 * 86_400_000),
						dataHash: `h${i}`,
						previousHash: `h${i - 1}`,
						chainSequence: i + 1,
						metadata: {
							topic: `topic-${i % 7}`,
							eventType: "test.event",
							publisher: `svc-${i % 3}`,
							instanceId: "i-1",
							messageId: `m${i}`,
						},
						payload: { i },
					};
				})
			);
		}

		const [, aggregationMs] = await timed(() =>
			events
				.aggregate([{ $group: { _id: "$metadata.topic", n: { $sum: 1 } } }])
				.toArray()
		);
		const [first, firstMs] = await timed(() => repository.getStats());
		const [second, secondMs] = await timed(() => repository.getStats());
		const [page, pageMs] = await timed(() =>
			repository.query({ page: 1 } as never)
		);
		console.info(
			`events=${EVENTS} full $group=${aggregationMs}ms getStats cold=${firstMs}ms warm=${secondMs}ms unfiltered page=${pageMs}ms`
		);

		expect(first.totalEvents).toBe(EVENTS);
		expect(Object.values(first.eventsByTopic).reduce((a, b) => a + b, 0)).toBe(
			EVENTS
		);
		expect(first.eventsByTopic["topic-0" as never]).toBe(Math.ceil(EVENTS / 7));
		expect(first.eventsByPublisher["svc-2" as never]).toBe(
			Math.floor(EVENTS / 3)
		);
		expect(first.dateRange).toEqual({
			earliest: new Date(T0),
			latest: new Date(T0 + (EVENTS - 1) * 1000),
		});
		expect(second.eventsByTopic).toEqual(first.eventsByTopic);
		expect(page.total).toBe(EVENTS);
		await db.dropDatabase();
	}, 600_000);
});
