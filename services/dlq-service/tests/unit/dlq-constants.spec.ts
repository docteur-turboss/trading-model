import { describe, expect, it } from "@jest/globals";

describe("dlq-constants", () => {
	it("should export DLQ_MAX_CONSECUTIVE_ERRORS as 3", () => {
		const mod = jest.requireActual("../../src/dlq/dlq-constants") as Record<
			string,
			unknown
		>;
		expect(mod.DLQ_MAX_CONSECUTIVE_ERRORS).toBe(3);
	});

	it("should export DLQ_MAX_PASS_COUNT as 3", () => {
		const mod = jest.requireActual("../../src/dlq/dlq-constants") as Record<
			string,
			unknown
		>;
		expect(mod.DLQ_MAX_PASS_COUNT).toBe(3);
	});

	it("should export CLAIM_PROJECTION with expected fields", () => {
		const mod = jest.requireActual("../../src/dlq/dlq-constants") as Record<
			string,
			unknown
		>;
		expect(mod.CLAIM_PROJECTION).toEqual({
			_id: 1,
			topic: 1,
			message: 1,
			reason: 1,
			deliveryAttempt: 1,
			createdAt: 1,
		});
	});
});
