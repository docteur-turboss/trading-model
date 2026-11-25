import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import { busJournalFromEnv } from "@trading-model/broker-message/create-message-manager";
import { MongoClient } from "mongodb";
import { importMongoDlq } from "../../src/adapters/outbound/mongo-dlq-import";

// A topic per run: the bus key prefix is shared with other specs.
const TOPIC = `market.candles.fetch.${Date.now()}`;
const message = {
	metadata: { topic: TOPIC, messageId: "m-1" },
	payload: { a: 1 },
};

describe("importMongoDlq against MongoDB and Redis", () => {
	let mongo: MongoClient;

	beforeAll(async () => {
		mongo = await MongoClient.connect(process.env.TEST_MONGO_URI as string);
	});

	afterAll(async () => {
		await mongo.close();
	});

	it("copies every waiting entry once, counts them, and a second run writes nothing", async () => {
		const collection = mongo
			.db(`dlq-import-${Date.now()}`)
			.collection("dlq_entries");
		await collection.insertMany([
			{
				topic: TOPIC,
				service: "audit-logger",
				reason: "r1",
				deliveryAttempt: 3,
				status: "pending",
				message,
			},
			{
				topic: TOPIC,
				service: "audit-logger",
				reason: "r2",
				status: "abandoned",
				message,
			},
			{
				topic: TOPIC,
				service: "audit-logger",
				reason: "done",
				status: "completed",
				message,
			},
			{ topic: TOPIC, reason: "no service", status: "pending", message },
		] as never);
		const journal = busJournalFromEnv({
			REDIS_URL: process.env.TEST_REDIS_URL,
		});
		const streams = new DeadStreams(journal);

		const first = await importMongoDlq(collection as never, streams);
		const second = await importMongoDlq(collection as never, streams);

		expect(first).toMatchObject({
			eligible: 3,
			written: 2,
			alreadyImported: 0,
		});
		expect(first.unusable).toHaveLength(1);
		expect(second).toMatchObject({ written: 0, alreadyImported: 2 });
		expect(await streams.length(TOPIC)).toBe(2);
		const [entry] = await streams.list(TOPIC);
		expect(entry).toMatchObject({
			group: "audit-logger",
			attempts: 3,
			reason: "r1",
			message,
		});
	});
});
