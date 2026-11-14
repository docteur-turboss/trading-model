import { describe, expect, it } from "@jest/globals";
import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import {
	REPLAY_BATCH_TIMEOUT_MS,
	REPLAY_DELIVERY_TIMEOUT_MS,
	STALE_CLAIM_MS,
} from "../../src/domain/dlq-constants";

describe("dlq-constants", () => {
	it("should export DLQ_MAX_CONSECUTIVE_ERRORS as 3", () => {
		const mod = jest.requireActual("../../src/domain/dlq-constants") as Record<
			string,
			unknown
		>;
		expect(mod.DLQ_MAX_CONSECUTIVE_ERRORS).toBe(3);
	});

	it("should export DLQ_MAX_PASS_COUNT as 3", () => {
		const mod = jest.requireActual("../../src/domain/dlq-constants") as Record<
			string,
			unknown
		>;
		expect(mod.DLQ_MAX_PASS_COUNT).toBe(3);
	});

	it("should export CLAIM_PROJECTION with expected fields", () => {
		const mod = jest.requireActual("../../src/domain/dlq-constants") as Record<
			string,
			unknown
		>;
		expect(mod.CLAIM_PROJECTION).toEqual({
			_id: 1,
			topic: 1,
			message: 1,
			service: 1,
			reason: 1,
			deliveryAttempt: 1,
			createdAt: 1,
		});
	});

	it("waits for message-manager's answer to a replay rather than timing out first", () => {
		expect(REPLAY_DELIVERY_TIMEOUT_MS).toBeGreaterThan(
			PUBLISH_ACCEPT_TIMEOUT_MS
		);
	});

	it("never releases the claim of a delivery that may still be in flight", () => {
		expect(STALE_CLAIM_MS).toBeGreaterThan(
			REPLAY_BATCH_TIMEOUT_MS + REPLAY_DELIVERY_TIMEOUT_MS
		);
	});
});
