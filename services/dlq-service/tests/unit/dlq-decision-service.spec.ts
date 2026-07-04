import { describe, expect, it } from "@jest/globals";
import { DlqDecisionService } from "../../src/domain/dlq-decision-service";

describe("DlqDecisionService", () => {
	const service = new DlqDecisionService();

	describe("evaluate", () => {
		it("should return retryable when counts are below thresholds", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 0,
				retryCount: 1,
				consecutiveErrors: 0,
				totalEntries: 10,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.pingPongAbandon).toBe(false);
			expect(result.isRetryable).toBe(true);
			expect(result.shouldAbandon).toBe(false);
			expect(result.isAtCapacity).toBe(false);
		});

		it("should detect ping-pong abandon when dlqPassCount >= 3", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 3,
				retryCount: 0,
				consecutiveErrors: 0,
				totalEntries: 10,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.pingPongAbandon).toBe(true);
			expect(result.pingPongReason).toContain("Ping-pong detected");
			expect(result.isRetryable).toBe(true);
		});

		it("should mark shouldAbandon when retryCount >= maxRetryAttempts", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 0,
				retryCount: 5,
				consecutiveErrors: 0,
				totalEntries: 10,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.shouldAbandon).toBe(true);
			expect(result.isRetryable).toBe(false);
		});

		it("should mark shouldAbandon when consecutiveErrors >= 3", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 0,
				retryCount: 1,
				consecutiveErrors: 3,
				totalEntries: 10,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.shouldAbandon).toBe(true);
			expect(result.isRetryable).toBe(false);
		});

		it("should detect capacity when totalEntries >= maxEntries", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 0,
				retryCount: 1,
				consecutiveErrors: 0,
				totalEntries: 100,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.isAtCapacity).toBe(true);
		});

		it("should not mark ping-pong abandon with dlqPassCount below threshold", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 2,
				retryCount: 0,
				consecutiveErrors: 0,
				totalEntries: 10,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.pingPongAbandon).toBe(false);
			expect(result.pingPongReason).toBeUndefined();
		});

		it("should not ping-pong abandon when isRetryable is true", () => {
			const result = service.evaluate({
				messageId: "msg-1",
				dlqPassCount: 0,
				retryCount: 2,
				consecutiveErrors: 1,
				totalEntries: 10,
				maxEntries: 100,
				maxRetryAttempts: 5,
			});
			expect(result.pingPongAbandon).toBe(false);
			expect(result.isRetryable).toBe(true);
			expect(result.shouldAbandon).toBe(false);
		});
	});

	describe("buildClaimFilter", () => {
		it("should return filter with max retry attempts and excluded statuses", () => {
			const filter = service.buildClaimFilter();
			expect(filter.retryCountMax).toBe(Number.MAX_SAFE_INTEGER);
			expect(filter.consecutiveErrorsMax).toBe(3);
			expect(filter.excludedStatuses).toEqual(["completed", "abandoned"]);
		});
	});
});
