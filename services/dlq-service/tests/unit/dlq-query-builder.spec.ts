import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/config/env", () => ({
	ENV: {
		DLQ_RETRY_MAX_ATTEMPTS: 3,
	},
}));

describe("DlqQueryBuilder", () => {
	let DlqQueryBuilderClass: new () => {
		buildListQuery: (options?: {
			topic?: string;
			before?: string;
			limit?: number;
			offset?: number;
		}) => Record<string, unknown>;
		buildQueuableQuery: () => Record<string, unknown>;
		buildActiveClaimQuery: () => Record<string, unknown>;
		buildDeleteQuery: (ids: string[]) => Record<string, unknown>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/dlq/dlq-query-builder") as {
			DlqQueryBuilder: typeof DlqQueryBuilderClass;
		};
		DlqQueryBuilderClass = mod.DlqQueryBuilder;
	});

	it("should build list query with no options", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildListQuery();
		expect(query).toEqual({});
	});

	it("should build list query with topic filter", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildListQuery({ topic: "test-topic" });
		expect(query).toHaveProperty("topic", "test-topic");
	});

	it("should build list query with before cursor", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildListQuery({
			before: "507f1f77bcf86cd799439011",
		});
		expect(query).toHaveProperty("_id");
	});

	it("should ignore invalid before cursor", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildListQuery({ before: "invalid-id" });
		expect(query).not.toHaveProperty("_id");
	});

	it("should build queuable query", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildQueuableQuery();
		expect(query).toHaveProperty("retryCount");
		expect(query).toHaveProperty("processingAt");
		expect(query).toHaveProperty("status");
		expect(query).toHaveProperty("consecutiveErrors");
	});

	it("should build active claim query", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildActiveClaimQuery();
		expect(query).toHaveProperty("processingAt");
		expect(query).toHaveProperty("status");
	});

	it("should build delete query with valid IDs", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildDeleteQuery(["507f1f77bcf86cd799439011"]);
		expect(query).toHaveProperty("_id");
		expect(query).toHaveProperty("processingAt");
	});

	it("should filter out invalid IDs in delete query", () => {
		const builder = new DlqQueryBuilderClass();
		const query = builder.buildDeleteQuery(["invalid"]);
		expect(
			(query as Record<string, unknown>)._id as Record<string, unknown>
		).toHaveProperty("$in");
		expect(
			((query as Record<string, unknown>)._id as Record<string, unknown>).$in
		).toHaveLength(0);
	});
});
