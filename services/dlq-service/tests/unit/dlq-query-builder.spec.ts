import { describe, expect, it, jest } from "@jest/globals";
import { ObjectId } from "mongodb";

jest.mock("../../src/infrastructure/config/env", () => ({
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
		buildClaimFilter: (topic?: string) => Record<string, unknown>;
		buildActiveClaimQuery: () => Record<string, unknown>;
		buildDeleteQuery: (ids: string[]) => Record<string, unknown>;
		buildBulkUpdateOps: (
			candidates: { _id: ObjectId }[],
			now: Date,
			instanceId: string,
			batchId: string
		) => unknown[];
		toValidObjectIds: (ids: string[]) => ObjectId[];
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/dlq-query-builder"
		) as {
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

	describe("buildClaimFilter", () => {
		it("should build filter without topic", () => {
			const builder = new DlqQueryBuilderClass();
			const filter = builder.buildClaimFilter();

			expect(filter).toEqual({
				retryCount: { $lt: 3 },
				processingAt: { $exists: false },
				status: { $nin: ["completed", "abandoned"] },
				consecutiveErrors: { $lt: 3 },
			});
		});

		it("should build filter with topic", () => {
			const builder = new DlqQueryBuilderClass();
			const filter = builder.buildClaimFilter("test.topic");

			expect(filter.topic).toBe("test.topic");
			expect(filter).toEqual({
				retryCount: { $lt: 3 },
				processingAt: { $exists: false },
				status: { $nin: ["completed", "abandoned"] },
				consecutiveErrors: { $lt: 3 },
				topic: "test.topic",
			});
		});
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

	describe("buildBulkUpdateOps", () => {
		it("should build bulk update operations", () => {
			const builder = new DlqQueryBuilderClass();
			const now = new Date();
			const oid1 = new ObjectId();
			const oid2 = new ObjectId();
			const ops = builder.buildBulkUpdateOps(
				[{ _id: oid1 }, { _id: oid2 }],
				now,
				"instance-1",
				"batch-1"
			);

			expect(ops).toHaveLength(2);
			expect(ops[0]).toEqual({
				updateOne: {
					filter: {
						_id: oid1,
						retryCount: { $lt: 3 },
						processingAt: { $exists: false },
						status: { $nin: ["completed", "abandoned"] },
						consecutiveErrors: { $lt: 3 },
					},
					update: {
						$set: {
							processingAt: now,
							processingInstance: "instance-1",
							lastBatchId: "batch-1",
						},
					},
				},
			});
		});
	});

	describe("toValidObjectIds", () => {
		it("should convert valid hex strings to ObjectIds", () => {
			const builder = new DlqQueryBuilderClass();
			const validId = "aaaaaaaaaaaaaaaaaaaaaaaa";
			const result = builder.toValidObjectIds([validId, "invalid"]);

			expect(result).toHaveLength(1);
			expect(result[0]).toBeInstanceOf(ObjectId);
			expect(result[0].toHexString()).toBe(validId);
		});

		it("should return empty array for all invalid ids", () => {
			const builder = new DlqQueryBuilderClass();
			const result = builder.toValidObjectIds(["invalid", "also-invalid"]);

			expect(result).toHaveLength(0);
		});
	});
});
