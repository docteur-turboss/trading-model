import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
	closeDb,
	getCollection,
	getDb,
	getMissingCriticalIndexes,
} from "../../src/config/db";

const EXPECTED_INDEX_KEYS = [
	{ _id: 1 },
	{ topic: 1, createdAt: -1 },
	{ createdAt: -1 },
	{ createdAt: 1 },
	{ retryCount: 1, topic: 1, createdAt: -1 },
	{ messageId: 1 },
	{ processingAt: 1 },
	{ processingInstance: 1 },
	{ status: 1, retryCount: 1 },
	{ retryCount: 1, createdAt: -1 },
	{ retryCount: 1, status: 1, createdAt: -1 },
	{ contentHash: 1, status: 1 },
];

beforeAll(async () => {
	await (await getDb())
		.dropCollection(process.env.MONGO_COLLECTION as string)
		.catch(() => undefined);
});

afterAll(async () => {
	await closeDb();
});

describe("DLQ indexes — real MongoDB", () => {
	it("should build every index on a fresh collection", async () => {
		const indexes = await (await getCollection()).indexes();

		expect(getMissingCriticalIndexes()).toEqual([]);
		expect(indexes.map((index) => index.key)).toEqual(
			expect.arrayContaining(EXPECTED_INDEX_KEYS)
		);
		expect(indexes).toHaveLength(EXPECTED_INDEX_KEYS.length);
	});
});
