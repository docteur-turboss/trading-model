import { describe, expect, it } from "@jest/globals";
import { MongoUriSchema } from "../../../src/infrastructure/config/mongo-uri";

describe("MongoUriSchema", () => {
	it.each([
		"mongodb://localhost:27017/audit-logger",
		"mongodb://mongo-audit-0.mongo-audit-headless:27017,mongo-audit-1.mongo-audit-headless:27017/audit?replicaSet=rs0-audit",
		"mongodb+srv://cluster0.example.net/audit",
		"mongodb://user:secret@db:27017",
	])("accepts %s", (uri) => {
		expect(MongoUriSchema.safeParse(uri).success).toBe(true);
	});

	it.each([
		"http://localhost:27017/audit",
		"mongodb://",
		"mongodb://host name:27017",
		"localhost:27017",
	])("rejects %s", (uri) => {
		expect(MongoUriSchema.safeParse(uri).success).toBe(false);
	});
});
