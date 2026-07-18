import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { AddressManagerClient } from "../../src/client/address-manager-client";
import { createRefreshJob } from "../../src/scheduler/refresh-job";

describe("createRefreshJob<AddressManagerClient>", () => {
	let mockClient: jest.Mocked<AddressManagerClient>;

	beforeEach(() => {
		mockClient = {
			refreshTTL: jest.fn(),
		} as unknown as jest.Mocked<AddressManagerClient>;
	});

	describe("constructor & schedule", () => {
		test("should set schedule correctly for given refresh interval", () => {
			const refreshIntervalMs = 5 * 60_000;
			const job = createRefreshJob(
				mockClient,
				(c) => c.refreshTTL(),
				refreshIntervalMs
			);

			expect(job.schedule).toBe("*/5 * * * *");
		});

		test("should use seconds-based cron for intervals < 1 minute", () => {
			const THIRTY_SECONDS_MS = 30_000;
			const job = createRefreshJob(
				mockClient,
				(c) => c.refreshTTL(),
				THIRTY_SECONDS_MS
			);
			expect(job.schedule).toBe("*/30 * * * * *");
		});
	});

	describe("execute method", () => {
		test("execute should call refreshTTL on AddressManagerClient", async () => {
			const job = createRefreshJob(mockClient, (c) => c.refreshTTL(), 60_000);

			await job.execute();

			expect(mockClient.refreshTTL).toHaveBeenCalledTimes(1);
		});

		test("execute should propagate errors from AddressManagerClient", async () => {
			const job = createRefreshJob(mockClient, (c) => c.refreshTTL(), 60_000);
			const error = new Error("Refresh failed");

			mockClient.refreshTTL.mockRejectedValueOnce(error);

			await expect(job.execute()).rejects.toThrow("Refresh failed");
		});
	});

	describe("private intervalMsToCron method", () => {
		test("intervalMsToCron generates correct cron for multiple intervals", () => {
			const intervals = [
				{ ms: 60_000, expected: "*/1 * * * *" },
				{ ms: 5 * 60_000, expected: "*/5 * * * *" },
				{ ms: 120_000, expected: "*/2 * * * *" },
				{ ms: 5000, expected: "*/5 * * * * *" },
			];

			intervals.forEach(({ ms, expected }) => {
				const job = createRefreshJob(mockClient, (c) => c.refreshTTL(), ms);
				expect(job.schedule).toBe(expected);
			});
		});
	});
});
