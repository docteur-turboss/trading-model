import { describe, expect, it, jest } from "@jest/globals";
import { sleep } from "../../src/utils/sleep";

describe("sleep", () => {
	it("should resolve after the specified number of milliseconds", async () => {
		jest.useFakeTimers();

		const promise = sleep(1000);
		jest.advanceTimersByTime(1000);

		await expect(promise).resolves.toBeUndefined();

		jest.useRealTimers();
	});

	it("should resolve with void", async () => {
		jest.useFakeTimers();

		const promise = sleep(0);
		jest.advanceTimersByTime(0);

		const result = await promise;
		expect(result).toBeUndefined();

		jest.useRealTimers();
	});
});
