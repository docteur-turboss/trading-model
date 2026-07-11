import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("node:fs/promises", () => ({
	appendFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

import fsPromises from "node:fs/promises";
import { retryFileAppend } from "../../../src/utils/retry-file-append";

describe("retryFileAppend", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return true on successful append", async () => {
		const result = await retryFileAppend("/tmp/test.log", "hello");
		expect(result).toBe(true);
		expect(fsPromises.appendFile).toHaveBeenCalledWith(
			"/tmp/test.log",
			"hello\n",
			"utf-8"
		);
	});

	it("should retry on failure and return true if eventually succeeds", async () => {
		(fsPromises.appendFile as jest.Mock<() => Promise<void>>)
			.mockRejectedValueOnce(new Error("fail"))
			.mockRejectedValueOnce(new Error("fail"))
			.mockResolvedValue(undefined);

		const result = await retryFileAppend("/tmp/test.log", "data");
		expect(result).toBe(true);
		expect(fsPromises.appendFile).toHaveBeenCalledTimes(3);
	});

	it("should return false when all retries fail", async () => {
		(fsPromises.appendFile as jest.Mock<() => Promise<void>>).mockRejectedValue(
			new Error("disk full")
		);

		const result = await retryFileAppend("/tmp/test.log", "data", {
			maxRetries: 2,
			baseDelayMs: 10,
		});
		expect(result).toBe(false);
		expect(fsPromises.appendFile).toHaveBeenCalledTimes(2);
	});

	it("should use default options when none provided", async () => {
		(fsPromises.appendFile as jest.Mock<() => Promise<void>>).mockRejectedValue(
			new Error("fail")
		);

		const result = await retryFileAppend("/tmp/test.log", "data");
		expect(result).toBe(false);
		expect(fsPromises.appendFile).toHaveBeenCalledTimes(3);
	});
});
