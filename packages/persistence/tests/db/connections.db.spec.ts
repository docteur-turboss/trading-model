import { afterAll, describe, expect, it } from "@jest/globals";
import { URLString } from "@trading-model/primitives/primitives";
import { MongoConnectionManager } from "../../src/mongo-connection-manager";
import { createFromUrl } from "../../src/redis-client-factories";

describe("MongoConnectionManager — real MongoDB", () => {
	const manager = new MongoConnectionManager({
		uri: URLString.of(process.env.TEST_MONGO_URI as string),
		dbName: "persistence_db_spec",
	});

	afterAll(async () => {
		await manager.close();
	});

	it("should round-trip a document through the managed connection", async () => {
		const collection = (await manager.getDb()).collection("smoke");

		await collection.insertOne({ _id: "doc-1" as never, value: 42 });

		await expect(
			collection.findOne({ _id: "doc-1" as never })
		).resolves.toEqual({ _id: "doc-1", value: 42 });
		expect(manager.isConnected()).toBe(true);
	});

	it("should run against a replica set primary so transactions are available", async () => {
		const hello = await (await manager.getDb()).admin().command({ hello: 1 });

		expect(hello.setName).toBe("rs0");
		expect(hello.isWritablePrimary).toBe(true);
	});
});

describe("createFromUrl — real Redis", () => {
	const client = createFromUrl(
		URLString.of(process.env.TEST_REDIS_URL as string)
	);

	afterAll(async () => {
		await client.quit();
	});

	it("should connect lazily and round-trip a key with its TTL", async () => {
		await client.connect();

		await client.set("smoke:key", "value", "EX", 60);

		await expect(client.get("smoke:key")).resolves.toBe("value");
		await expect(client.ttl("smoke:key")).resolves.toBeGreaterThan(0);
	});
});
