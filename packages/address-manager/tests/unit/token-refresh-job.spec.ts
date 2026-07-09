import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { TokenManager } from "../../src/client/token-manager";
import { RefreshJob } from "../../src/scheduler/refresh-job";

describe("RefreshJob<TokenManager>", () => {
	let mockTokenManager: jest.Mocked<TokenManager>;

	beforeEach(() => {
		mockTokenManager = {
			refreshToken: jest.fn().mockResolvedValue(undefined as never),
		} as unknown as jest.Mocked<TokenManager>;
	});

	describe("constructor / schedule", () => {
		test("should create a job and generate correct cron expression for normal interval", () => {
			const job = new RefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				5 * 60_000
			); // 5 minutes
			expect(job.schedule).toBe("*/5 * * * *");
		});

		test("should use seconds-based cron for interval < 1 minute", () => {
			const job = new RefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				10_000
			); // 10 seconds
			expect(job.schedule).toBe("*/10 * * * * *");
		});

		test("should generate cron expression rounding down fractional minutes", () => {
			const job = new RefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				125_000
			); // 2 min 5 sec
			expect(job.schedule).toBe("*/2 * * * *");
		});
	});

	describe("execute", () => {
		test("execute should call tokenManager.refreshToken once", async () => {
			const job = new RefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				5 * 60_000
			);
			await job.execute();
			expect(mockTokenManager.refreshToken).toHaveBeenCalledTimes(1);
		});

		test("execute should propagate errors from tokenManager.refreshToken", async () => {
			const job = new RefreshJob(
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
			const intervalMs = 120 * 60_000; // 120 minutes
			const job = new RefreshJob(
				mockTokenManager,
				(tm) => tm.refreshToken(),
				intervalMs
			);
			expect(job.schedule).toBe("*/120 * * * *");
		});
	});
});
