import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { TokenManager } from "../../src/client/token-manager";
import { createRefreshJob } from "../../src/scheduler/refresh-job";

describe("createRefreshJob<TokenManager>", () => {
	let mockTokenManager: jest.Mocked<TokenManager>;

	beforeEach(() => {
		mockTokenManager = {
			refreshToken: jest.fn().mockResolvedValue(undefined as never),
		} as unknown as jest.Mocked<TokenManager>;
	});

	describe("constructor / schedule", () => {
		test("should create a job and generate correct cron expression for normal interval", () => {
			const FIVE_MINUTES_MS = 5 * 60_000;
			const job = createRefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				FIVE_MINUTES_MS
			);
			expect(job.schedule).toBe("*/5 * * * *");
		});

		test("should use seconds-based cron for interval < 1 minute", () => {
			const TEN_SECONDS_MS = 10_000;
			const job = createRefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				TEN_SECONDS_MS
			);
			expect(job.schedule).toBe("*/10 * * * * *");
		});

		test("should generate cron expression rounding down fractional minutes", () => {
			const TWO_MIN_FIVE_SEC_MS = 125_000;
			const job = createRefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				TWO_MIN_FIVE_SEC_MS
			);
			expect(job.schedule).toBe("*/2 * * * *");
		});
	});

	describe("execute", () => {
		test("execute should call tokenManager.refreshToken once", async () => {
			const job = createRefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				5 * 60_000
			);
			await job.execute();
			expect(mockTokenManager.refreshToken).toHaveBeenCalledTimes(1);
		});

		test("execute should propagate errors from tokenManager.refreshToken", async () => {
			const job = createRefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				5 * 60_000
			);
			mockTokenManager.refreshToken.mockRejectedValueOnce(new Error("fail"));

			await expect(job.execute()).rejects.toThrow("fail");
		});
	});

	describe("edge cases", () => {
		test("should handle very large intervals", () => {
			const intervalMs = 120 * 60_000;
			const job = createRefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				intervalMs
			);
			expect(job.schedule).toBe("*/120 * * * *");
		});
	});
});
