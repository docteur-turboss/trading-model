import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("../../src/config/env", () => ({
	ENV: {},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), error: jest.fn() },
}));

import { logger } from "@trading-model/common/config/logger";
import { KeyRotator } from "../../src/core/key-rotator";

const MOCK_CA = {
	getCurrentKeyId: jest.fn(),
	getKeyVersion: jest.fn(),
	rotateKey: jest.fn(),
	cleanupKeyHistory: jest.fn(),
};

describe("KeyRotator", () => {
	let rotator: KeyRotator;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();

		rotator = new KeyRotator({
			ca: MOCK_CA as any,
			intervalMs: 3600000,
			retentionCount: 3,
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("start", () => {
		it("should set an interval timer", () => {
			const setIntervalSpy = jest.spyOn(global, "setInterval");

			rotator.start();

			expect(setIntervalSpy).toHaveBeenCalledWith(
				expect.any(Function),
				3600000
			);
		});

		it("should not start a second timer if already running", () => {
			const setIntervalSpy = jest.spyOn(global, "setInterval");

			rotator.start();
			rotator.start();

			expect(setIntervalSpy).toHaveBeenCalledTimes(1);
		});

		it("should log starting message", () => {
			rotator.start();

			expect(logger.info).toHaveBeenCalledWith("Starting CA key rotator", {
				context: {
					intervalMs: 3600000,
					retentionCount: 3,
				},
			});
		});
	});

	describe("stop", () => {
		it("should clear the interval timer", () => {
			const clearIntervalSpy = jest.spyOn(global, "clearInterval");

			rotator.start();
			rotator.stop();

			expect(clearIntervalSpy).toHaveBeenCalled();
		});

		it("should log stopping message", () => {
			rotator.start();
			rotator.stop();

			expect(logger.info).toHaveBeenCalledWith("CA key rotator stopped");
		});

		it("should not throw if stopping without starting", () => {
			expect(() => rotator.stop()).not.toThrow();
		});
	});

	describe("rotation logic", () => {
		it("should rotate key and cleanup on each interval", async () => {
			MOCK_CA.getCurrentKeyId.mockReturnValue("old-key");
			MOCK_CA.getKeyVersion.mockReturnValue(1);
			MOCK_CA.rotateKey.mockResolvedValue("new-key");

			rotator.start();
			jest.advanceTimersByTime(3600000);
			await jest.advanceTimersByTimeAsync(0);

			expect(MOCK_CA.rotateKey).toHaveBeenCalled();
			expect(MOCK_CA.cleanupKeyHistory).toHaveBeenCalledWith(3);
		});

		it("should log key rotation success", async () => {
			MOCK_CA.getCurrentKeyId
				.mockReturnValueOnce("old-key")
				.mockReturnValueOnce("new-key");
			MOCK_CA.getKeyVersion.mockReturnValueOnce(1).mockReturnValueOnce(2);
			MOCK_CA.rotateKey.mockResolvedValue("new-key");

			rotator.start();
			jest.advanceTimersByTime(3600000);
			await jest.advanceTimersByTimeAsync(0);

			expect(logger.info).toHaveBeenCalledWith("CA key rotated", {
				context: {
					previousKeyId: "old-key",
					previousVersion: 1,
					newKeyId: "new-key",
					newVersion: 2,
				},
			});
		});

		it("should log error when rotation fails", async () => {
			MOCK_CA.rotateKey.mockRejectedValue(new Error("rotate failed"));

			rotator.start();
			jest.advanceTimersByTime(3600000);
			await jest.advanceTimersByTimeAsync(0);

			expect(logger.error).toHaveBeenCalledWith(
				"CA key rotation failed",
				expect.any(Object)
			);
		});
	});
});
