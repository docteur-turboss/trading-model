import { describe, expect, it, jest } from "@jest/globals";
import { ObjectId } from "mongodb";

jest.mock("../../src/config/env", () => ({
	ENV: {
		DLQ_RETRY_MAX_ATTEMPTS: 3,
		MONGO_URI: "mongodb://localhost:27017",
		MONGO_DB: "test",
		MONGO_COLLECTION: "dlq",
		MAX_ENTRIES: 100,
		DLQ_AUTO_RETRY_LIMIT: 50,
		MESSAGE_MANAGER_URL: "",
		INSTANCE_ID: "test",
		TLS_CA_PATH: "",
		TLS_CERT_PATH: "",
		TLS_KEY_PATH: "",
		DLQ_ALLOWED_SERVICES: "message-manager,admin",
		DLQ_AUTH_HMAC_SECRET: "test-secret-16-chars",
		DLQ_PRUNE_INTERVAL_MS: 60000,
		DLQ_AUTO_RETRY_ENABLED: true,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
	},
}));

describe("ClaimFilterBuilder", () => {
	describe("buildClaimFilter", () => {
		it("should build filter without topic", () => {
			const { ClaimFilterBuilder } = jest.requireActual(
				"../../src/dlq/claim-filter-builder"
			) as {
				ClaimFilterBuilder: new () => {
					buildClaimFilter: (topic?: string) => Record<string, unknown>;
					buildAtomicCondition: () => Record<string, unknown>;
					buildBulkUpdateOps: (...args: unknown[]) => unknown[];
					toValidObjectIds: (ids: string[]) => ObjectId[];
				};
			};
			const builder = new ClaimFilterBuilder();
			const filter = builder.buildClaimFilter();

			expect(filter).toEqual({
				retryCount: { $lt: 3 },
				processingAt: { $exists: false },
				status: { $nin: ["completed", "abandoned"] },
				consecutiveErrors: { $lt: 3 },
			});
		});

		it("should build filter with topic", () => {
			const { ClaimFilterBuilder } = jest.requireActual(
				"../../src/dlq/claim-filter-builder"
			) as {
				ClaimFilterBuilder: new () => {
					buildClaimFilter: (topic?: string) => Record<string, unknown>;
				};
			};
			const builder = new ClaimFilterBuilder();
			const filter = builder.buildClaimFilter("test.topic");

			expect(filter.topic).toBe("test.topic");
		});
	});

	describe("buildAtomicCondition", () => {
		it("should build atomic update condition", () => {
			const { ClaimFilterBuilder } = jest.requireActual(
				"../../src/dlq/claim-filter-builder"
			) as {
				ClaimFilterBuilder: new () => {
					buildAtomicCondition: () => Record<string, unknown>;
				};
			};
			const builder = new ClaimFilterBuilder();
			const condition = builder.buildAtomicCondition();

			expect(condition).toEqual({
				retryCount: { $lt: 3 },
				processingAt: { $exists: false },
				status: { $nin: ["completed", "abandoned"] },
				consecutiveErrors: { $lt: 3 },
			});
		});
	});

	describe("buildBulkUpdateOps", () => {
		it("should build bulk update operations", () => {
			const { ClaimFilterBuilder } = jest.requireActual(
				"../../src/dlq/claim-filter-builder"
			) as {
				ClaimFilterBuilder: new () => {
					buildBulkUpdateOps: (
						candidates: { _id: ObjectId; objectId: ObjectId }[],
						now: Date,
						instanceId: string,
						batchId: string
					) => unknown[];
				};
			};
			const builder = new ClaimFilterBuilder();
			const now = new Date();
			const oid1 = new ObjectId();
			const oid2 = new ObjectId();
			const ops = builder.buildBulkUpdateOps(
				[
					{ _id: oid1, objectId: oid1 },
					{ _id: oid2, objectId: oid2 },
				],
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
			const { ClaimFilterBuilder } = jest.requireActual(
				"../../src/dlq/claim-filter-builder"
			) as {
				ClaimFilterBuilder: new () => {
					toValidObjectIds: (ids: string[]) => ObjectId[];
				};
			};
			const builder = new ClaimFilterBuilder();
			const validId = "aaaaaaaaaaaaaaaaaaaaaaaa";
			const result = builder.toValidObjectIds([validId, "invalid"]);

			expect(result).toHaveLength(1);
			expect(result[0]).toBeInstanceOf(ObjectId);
			expect(result[0].toHexString()).toBe(validId);
		});

		it("should return empty array for all invalid ids", () => {
			const { ClaimFilterBuilder } = jest.requireActual(
				"../../src/dlq/claim-filter-builder"
			) as {
				ClaimFilterBuilder: new () => {
					toValidObjectIds: (ids: string[]) => ObjectId[];
				};
			};
			const builder = new ClaimFilterBuilder();
			const result = builder.toValidObjectIds(["invalid", "also-invalid"]);

			expect(result).toHaveLength(0);
		});
	});
});
