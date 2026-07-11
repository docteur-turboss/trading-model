import { describe, expect, it } from "@jest/globals";
import { DeleteSchema, DlqEntrySchema } from "../../src/dlq/dlq-schemas";

describe("dlq-schemas", () => {
	describe("DlqEntrySchema", () => {
		it("should accept a valid entry", () => {
			const result = DlqEntrySchema.safeParse({
				topic: "test.topic",
				message: { key: "value" },
				reason: "timeout",
				deliveryAttempt: 1,
				timestamp: "2024-01-01T00:00:00.000Z",
			});
			expect(result.success).toBe(true);
		});

		it("should accept entry without optional fields", () => {
			const result = DlqEntrySchema.safeParse({
				message: "hello",
				deliveryAttempt: 0,
				timestamp: "2024-01-01T00:00:00.000Z",
			});
			expect(result.success).toBe(true);
		});

		it("should reject missing required fields", () => {
			const result = DlqEntrySchema.safeParse({});
			expect(result.success).toBe(false);
		});

		it("should reject invalid deliveryAttempt", () => {
			const result = DlqEntrySchema.safeParse({
				message: "test",
				deliveryAttempt: "not-a-number",
				timestamp: "2024-01-01T00:00:00.000Z",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("DeleteSchema", () => {
		it("should accept an array of ids", () => {
			const result = DeleteSchema.safeParse({ ids: ["id1", "id2"] });
			expect(result.success).toBe(true);
		});

		it("should reject empty ids array", () => {
			const result = DeleteSchema.safeParse({ ids: [] });
			expect(result.success).toBe(false);
		});

		it("should reject more than 1000 ids", () => {
			const result = DeleteSchema.safeParse({
				ids: Array.from({ length: 1001 }, (_, i) => `id${i}`),
			});
			expect(result.success).toBe(false);
		});
	});
});
