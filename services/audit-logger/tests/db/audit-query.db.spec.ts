import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import { DateRange } from "@trading-model/primitives/date-range";
import {
	Limit,
	PageNumber,
} from "@trading-model/primitives/primitives/page-number";
import { MongoClient } from "mongodb";
import type { ParsedEnvelope } from "../../src/adapters/inbound/subscription/message-parser";
import { buildAuditDocument } from "../../src/adapters/outbound/persistence/audit-document-builder";
import {
	type AuditEventQuery,
	AuditRepository,
} from "../../src/adapters/outbound/persistence/audit-repository";

const NOON = Date.UTC(2026, 9, 31, 12, 0, 0);

function envelope(event: {
	id: string;
	topic?: string;
	publisher?: string;
	at?: number;
	correlationId?: string;
}): ParsedEnvelope {
	return {
		topic: event.topic ?? "market.data",
		payload: { id: event.id },
		metadata: {
			messageId: event.id,
			emittedAt: new Date(event.at ?? NOON).toISOString(),
			publisher: {
				serviceName: event.publisher ?? "financial-scraper",
				instanceId: "i-1",
			},
			...(event.correlationId ? { correlationId: event.correlationId } : {}),
		},
	} as unknown as ParsedEnvelope;
}

describe("AuditRepository reads — real MongoDB", () => {
	let client: MongoClient;
	let repository: AuditRepository;

	async function record(...events: Parameters<typeof envelope>[0][]) {
		for (const event of events) {
			await repository.insert(buildAuditDocument(envelope(event), 30));
		}
	}

	async function ids(query: Partial<AuditEventQuery>): Promise<string[]> {
		const { docs } = await repository.query(query as AuditEventQuery);
		return docs.map((doc) => doc.metadata.messageId);
	}

	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});

	beforeEach(async () => {
		repository = new AuditRepository(client.db(`audit-query-${Date.now()}`));
		await repository.ensureIndexes();
	});

	afterAll(async () => {
		await client.close();
	});

	it("should filter on topic, publisher, correlation id and the received range, newest first", async () => {
		await record(
			{ id: "a", at: NOON },
			{
				id: "b",
				at: NOON + 1000,
				topic: "trading.signal",
				correlationId: "c-1",
			},
			{
				id: "c",
				at: NOON + 2000,
				publisher: "trader-service",
				correlationId: "c-1",
			},
			{ id: "d", at: NOON + 3000 }
		);

		await expect(ids({})).resolves.toEqual(["d", "c", "b", "a"]);
		await expect(ids({ topic: "trading.signal" as never })).resolves.toEqual([
			"b",
		]);
		await expect(
			ids({ publisher: "trader-service" as never })
		).resolves.toEqual(["c"]);
		await expect(ids({ correlationId: "c-1" as never })).resolves.toEqual([
			"c",
			"b",
		]);
		await expect(
			ids({
				dateRange: DateRange.fromQueryParams(
					new Date(NOON + 1000).toISOString(),
					new Date(NOON + 2000).toISOString()
				),
			})
		).resolves.toEqual(["c", "b"]);
		await expect(
			ids({
				dateRange: DateRange.fromQueryParams(
					new Date(NOON + 2000).toISOString()
				),
			})
		).resolves.toEqual(["d", "c"]);
	});

	it("should page through events received at the same instant without skipping or repeating one", async () => {
		// A publisher batch carries one emittedAt for all its messages.
		const batch = Array.from({ length: 25 }, (_, i) => ({ id: `m-${i}` }));
		await record(...batch);

		const seen: string[] = [];
		let total = 0;
		for (let page = 1; page <= 3; page++) {
			const result = await repository.query({
				page: PageNumber.of(page),
				limit: Limit.of(10, 1000),
			} as AuditEventQuery);
			total = result.total;
			seen.push(...result.docs.map((doc) => doc.metadata.messageId));
		}

		expect(total).toBe(25);
		expect(new Set(seen).size).toBe(25);
	});

	it("should find an event by its message id", async () => {
		await record({ id: "wanted", correlationId: "c-9" }, { id: "other" });

		await expect(repository.findById("wanted")).resolves.toMatchObject({
			metadata: { messageId: "wanted", correlationId: "c-9" },
		});
		await expect(repository.findById("missing")).resolves.toBeNull();
	});

	it("should count events by topic and publisher, with the received range", async () => {
		await record(
			{ id: "a", at: NOON },
			{ id: "b", at: NOON + 1000, topic: "trading.signal" },
			{ id: "c", at: NOON + 2000, publisher: "trader-service" }
		);

		await expect(repository.getStats()).resolves.toEqual({
			totalEvents: 3,
			eventsByTopic: { "market.data": 2, "trading.signal": 1 },
			eventsByPublisher: { "financial-scraper": 2, "trader-service": 1 },
			dateRange: { earliest: new Date(NOON), latest: new Date(NOON + 2000) },
		});
	});
});
