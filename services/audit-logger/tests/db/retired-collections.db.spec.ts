import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { type Db, MongoClient } from "mongodb";
import { dropRetiredCollections } from "../../src/adapters/outbound/persistence/retired-collections";

async function collectionNames(db: Db): Promise<string[]> {
	const collections = await db
		.listCollections({}, { nameOnly: true })
		.toArray();
	return collections.map((collection) => collection.name);
}

describe("dropRetiredCollections against MongoDB", () => {
	let client: MongoClient;

	beforeAll(async () => {
		client = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});

	afterAll(async () => {
		await client.close();
	});

	it("drops audit_jobs as an older version left it: empty, with its indexes", async () => {
		const db = client.db(`retired-empty-${Date.now()}`);
		await db
			.collection("audit_jobs")
			.createIndex({ jobId: 1 }, { unique: true });

		await dropRetiredCollections(db);

		expect(await collectionNames(db)).not.toContain("audit_jobs");
		await db.dropDatabase();
	});

	it("keeps audit_jobs when it holds a document", async () => {
		const db = client.db(`retired-kept-${Date.now()}`);
		await db.collection("audit_jobs").insertOne({ jobId: "j-1" });

		await dropRetiredCollections(db);

		expect(await db.collection("audit_jobs").countDocuments()).toBe(1);
		await db.dropDatabase();
	});
});
