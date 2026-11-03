import { describe, expect, it } from "@jest/globals";
import { parseRequest } from "@trading-model/http/adapters/inbound/api-route/api-route";
import { DLQ_API } from "../../src/adapters/inbound/api-routes";

describe("DLQ_API", () => {
	describe("listEntries query", () => {
		it("applies the defaults", () => {
			expect(parseRequest(DLQ_API.listEntries, { query: {} })).toMatchObject({
				success: true,
				input: { query: { limit: 10, offset: 0 } },
			});
		});

		it("coerces the numbers and keeps the cursor", () => {
			const parsed = parseRequest(DLQ_API.listEntries, {
				query: { topic: "t", limit: "25", offset: "5", cursor: "abc" },
			});

			expect(parsed).toMatchObject({
				success: true,
				input: { query: { topic: "t", limit: 25, offset: 5, cursor: "abc" } },
			});
		});

		it("caps the limit at 1000 instead of rejecting it", () => {
			expect(
				parseRequest(DLQ_API.listEntries, { query: { limit: "5000" } })
			).toMatchObject({ success: true, input: { query: { limit: 1000 } } });
		});

		it("treats an empty topic as every topic", () => {
			const parsed = parseRequest(DLQ_API.listEntries, {
				query: { topic: "" },
			});

			expect(parsed.success && parsed.input.query.topic).toBeUndefined();
		});

		it.each([
			["a non-numeric limit", { limit: "abc" }],
			["a zero limit", { limit: "0" }],
			["a negative offset", { offset: "-1" }],
		])("rejects %s", (_label, query) => {
			expect(parseRequest(DLQ_API.listEntries, { query }).success).toBe(false);
		});
	});

	describe("deleteEntries body", () => {
		it("accepts an array of ids", () => {
			expect(
				parseRequest(DLQ_API.deleteEntries, { body: { ids: ["id1", "id2"] } })
					.success
			).toBe(true);
		});

		it.each([
			["an empty array", []],
			["more than 1000 ids", Array.from({ length: 1001 }, (_, i) => `id${i}`)],
		])("rejects %s", (_label, ids) => {
			expect(
				parseRequest(DLQ_API.deleteEntries, { body: { ids } }).success
			).toBe(false);
		});
	});

	describe("replayEntries query", () => {
		it("parses every field", () => {
			expect(
				parseRequest(DLQ_API.replayEntries, {
					query: { topic: "test-topic", limit: "25", batchId: "b-1" },
				})
			).toMatchObject({
				success: true,
				input: { query: { topic: "test-topic", limit: 25, batchId: "b-1" } },
			});
		});

		it("defaults the limit to 50", () => {
			expect(parseRequest(DLQ_API.replayEntries, { query: {} })).toMatchObject({
				success: true,
				input: { query: { limit: 50 } },
			});
		});

		it.each([
			["a negative limit", { limit: "-1" }],
			["a non-numeric limit", { limit: "abc" }],
			["a limit above 100", { limit: "200" }],
		])("rejects %s", (_label, query) => {
			expect(parseRequest(DLQ_API.replayEntries, { query }).success).toBe(
				false
			);
		});
	});
});
