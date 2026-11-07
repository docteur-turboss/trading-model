import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import { type Db, MongoClient } from "mongodb";
import {
	MongoAuditChainReader,
	MongoChainState,
} from "../../src/adapters/outbound/persistence/audit-chain-reader";
import {
	buildAuditDocument,
	type DeliveredEnvelope,
} from "../../src/adapters/outbound/persistence/audit-document-builder";
import {
	type AuditEventDocument,
	AuditRepository,
} from "../../src/adapters/outbound/persistence/audit-repository";
import { ChainAudit } from "../../src/application/audit-chain/chain-audit";
import { computeAuditHash } from "../../src/domain/audit-chain";

function envelope(i: number, correlationId?: string): DeliveredEnvelope {
	return {
		payload: { symbol: "BTCUSDT", price: 65000.5 + i, volume: i },
		metadata: {
			topic: "market.data",
			messageId: `msg-${i}`,
			emittedAt: new Date(Date.UTC(2026, 9, 31, 12, 0, i)).toISOString(),
			publisher: { serviceName: "financial-scraper", instanceId: "fs-1" },
			...(correlationId ? { correlationId } : {}),
		},
	} as unknown as DeliveredEnvelope;
}

/** The chain as anyone holding the database (an auditor, a restore) sees it. */
async function storedChain(db: Db): Promise<AuditEventDocument[]> {
	return db
		.collection<AuditEventDocument>("audit_events")
		.find({}, { projection: { _id: 0 } })
		.sort({ chainSequence: 1 })
		.toArray();
}

describe("audit hash chain stored in MongoDB", () => {
	let client: MongoClient;
	let db: Db;
	let repository: AuditRepository;

	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});

	beforeEach(async () => {
		db = client.db(`audit-chain-${Date.now()}`);
		repository = new AuditRepository(db);
		await repository.ensureIndexes();
	});

	afterAll(async () => {
		await client.close();
	});

	it("can be verified again from the stored events, with or without correlationId", async () => {
		await repository.insert(buildAuditDocument(envelope(1), 30));
		await repository.insert(buildAuditDocument(envelope(2, "corr-2"), 30));
		await repository.insert(buildAuditDocument(envelope(3), 30));
		await repository.insert(buildAuditDocument(envelope(4, "corr-4"), 30));

		const chain = await storedChain(db);

		expect(chain.map((event) => event.chainSequence)).toEqual([1, 2, 3, 4]);
		let previous = "";
		for (const event of chain) {
			expect(event.previousHash).toBe(previous);
			expect(
				computeAuditHash({
					receivedAt: event.receivedAt,
					metadata: event.metadata,
					payload: event.payload,
					previousHash: event.previousHash,
					chainSequence: event.chainSequence,
				})
			).toBe(event.dataHash);
			previous = event.dataHash;
		}
		expect(chain[0].metadata).not.toHaveProperty("correlationId");
	});
});

describe("ChainAudit on the stored trail", () => {
	let client: MongoClient;
	let db: Db;
	let repository: AuditRepository;
	const metrics = { verified: () => undefined, anchored: () => undefined };

	function chainAudit(): ChainAudit {
		return new ChainAudit({
			reader: new MongoAuditChainReader(db),
			state: new MongoChainState(db),
			anchors: null,
			retentionMs: 1827 * 86_400_000,
			metrics,
		});
	}

	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});

	beforeEach(async () => {
		db = client.db(`chain-audit-${Date.now()}`);
		repository = new AuditRepository(db);
		await repository.ensureIndexes();
	});

	afterAll(async () => {
		await client.close();
	});

	it("verifies the events audit-logger wrote, then resumes from its checkpoint", async () => {
		for (let i = 1; i <= 5; i++) {
			await repository.insert(
				buildAuditDocument(envelope(i, i % 2 ? undefined : `c-${i}`), 30)
			);
		}

		expect(await chainAudit().runCycle()).toMatchObject({
			count: 5,
			broken: null,
		});
		expect(await new MongoChainState(db).load()).toMatchObject({
			verified: { chainSequence: 5 },
		});

		await repository.insert(buildAuditDocument(envelope(6), 30));
		expect(await chainAudit().runCycle()).toMatchObject({
			count: 1,
			broken: null,
		});
	});

	it("finds an event changed in the database", async () => {
		for (let i = 1; i <= 3; i++) {
			await repository.insert(buildAuditDocument(envelope(i), 30));
		}
		await db
			.collection("audit_events")
			.updateOne({ chainSequence: 2 }, { $set: { "payload.price": 1 } });

		expect((await chainAudit().verify("full")).broken).toBe(
			"chainSequence 2: dataHash does not match the stored content"
		);
	});
});
