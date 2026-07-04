import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { AddressManagerClient } from "../../src/client/address-manager-client";
import { RefreshJob } from "../../src/scheduler/refresh-job";

describe("RefreshJob<AddressManagerClient>", () => {
	let mockClient: jest.Mocked<AddressManagerClient>;

	beforeEach(() => {
		mockClient = {
			refreshTTL: jest.fn(),
		} as unknown as jest.Mocked<AddressManagerClient>;
	});

	// -----------------------------------------------------------
	// CONSTRUCTOR & SCHEDULE
	// -----------------------------------------------------------
	test("should set schedule correctly for given refresh interval", () => {
		const refreshIntervalMs = 5 * 60_000; // 5 minutes
		const job = new RefreshJob(
			mockClient,
			(c) => c.refreshTTL(),
			refreshIntervalMs
		);

		// The cron expression for 5 minutes is */5 * * * *
		expect(job.schedule).toBe("*/5 * * * *");
	});

	test("should use seconds-based cron for intervals < 1 minute", () => {
		const job = new RefreshJob(mockClient, (c) => c.refreshTTL(), 30_000); // 30 sec
		expect(job.schedule).toBe("*/30 * * * * *");
	});

	// -----------------------------------------------------------
	// EXECUTE METHOD
	// -----------------------------------------------------------
	test("execute should call refreshTTL on AddressManagerClient", async () => {
		const job = new RefreshJob(mockClient, (c) => c.refreshTTL(), 60_000);

		await job.execute();

		expect(mockClient.refreshTTL).toHaveBeenCalledTimes(1);
	});

	test("execute should propagate errors from AddressManagerClient", async () => {
		const job = new RefreshJob(mockClient, (c) => c.refreshTTL(), 60_000);
		const error = new Error("Refresh failed");

		mockClient.refreshTTL.mockRejectedValueOnce(error);

		await expect(job.execute()).rejects.toThrow("Refresh failed");
	});

	// -----------------------------------------------------------
	// PRIVATE intervalMsToCron METHOD
	// -----------------------------------------------------------
	test("intervalMsToCron generates correct cron for multiple intervals", () => {
		const intervals = [
			{ ms: 60_000, expected: "*/1 * * * *" },
			{ ms: 5 * 60_000, expected: "*/5 * * * *" },
			{ ms: 120_000, expected: "*/2 * * * *" },
			{ ms: 5000, expected: "*/5 * * * * *" }, // 5 seconds
		];

		intervals.forEach(({ ms, expected }) => {
			const job = new RefreshJob(mockClient, (c) => c.refreshTTL(), ms);
			expect(job.schedule).toBe(expected);
		});
	});
});
