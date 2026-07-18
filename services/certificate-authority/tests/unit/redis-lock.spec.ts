import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSet: jest.Mock = jest.fn();
const mockGet: jest.Mock = jest.fn();
const mockEval: jest.Mock = jest.fn();
const mockDisconnect: jest.Mock = jest.fn();

let mockAvailable = true;

jest.mock("../../src/persistence/redis-lock-connector", () => ({
	RedisLockConnector: jest.fn().mockImplementation(() => ({
		get client() {
			return { set: mockSet, get: mockGet, eval: mockEval };
		},
		get available() {
			return mockAvailable;
		},
		setAvailable(v: boolean) {
			mockAvailable = v;
		},
		disconnect: mockDisconnect,
	})),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@trading-model/common/persistence/redis-constants", () => ({
	REDIS_RESP: { OK: "OK" },
	REDIS_SET: { PX: "PX", NX: "NX" },
}));

import type { LockContext } from "../../src/persistence/backends/lock-backend-interface";
import { RedisLockBackend } from "../../src/persistence/backends/redis-lock";

describe("RedisLockBackend", () => {
	let backend: RedisLockBackend;
	let context: LockContext;

	beforeEach(() => {
		jest.clearAllMocks();
		mockAvailable = true;
		backend = new RedisLockBackend("redis://localhost:6379");
		context = {
			lockName: "test-lock",
			instanceId: "instance-1" as any,
		};
	});

	describe("acquire", () => {
		it("should acquire lock successfully", async () => {
			mockSet.mockResolvedValue("OK");

			const token = await backend.acquire(context, 60000);
			expect(token).not.toBeNull();
			expect(typeof token).toBe("number");
			expect(mockSet).toHaveBeenCalled();
		});

		it("should retry when lock is not acquired and key disappears", async () => {
			mockSet.mockResolvedValueOnce(null);
			mockGet.mockResolvedValue(null);
			mockSet.mockResolvedValue("OK");

			const token = await backend.acquire(context, 60000);
			expect(token).not.toBeNull();
		});

		it("should return null on retry when key still exists", async () => {
			mockSet.mockResolvedValue(null);
			mockGet.mockResolvedValue("other-instance:12345");

			const token = await backend.acquire(context, 60000);
			expect(token).toBeNull();
		});

		it("should handle error and set connector unavailable", async () => {
			mockSet.mockRejectedValue(new Error("Redis error"));

			const token = await backend.acquire(context, 60000);
			expect(token).toBeNull();
			expect(mockAvailable).toBe(false);
		});
	});

	describe("release", () => {
		it("should release lock successfully", async () => {
			mockEval.mockResolvedValue(1);

			const result = await backend.release(context, 12345);
			expect(result).toBe(true);
			expect(mockEval).toHaveBeenCalled();
		});

		it("should return false when connector is not available", async () => {
			mockAvailable = false;
			const result = await backend.release(context, 12345);
			expect(result).toBe(false);
		});

		it("should return false when eval fails", async () => {
			mockEval.mockRejectedValue(new Error("Script error"));

			const result = await backend.release(context, 12345);
			expect(result).toBe(false);
		});
	});

	describe("verifyOwnership", () => {
		it("should return fencing token when ownership matches", async () => {
			mockGet.mockResolvedValue("instance-1:12345");

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(12345);
		});

		it("should return -1 when ownership mismatches", async () => {
			mockGet.mockResolvedValue("instance-2:67890");

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(-1);
		});

		it("should return -1 when key does not exist", async () => {
			mockGet.mockResolvedValue(null);

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(-1);
		});

		it("should return -1 when connector is not available", async () => {
			mockAvailable = false;
			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(-1);
		});

		it("should return -1 when get fails", async () => {
			mockGet.mockRejectedValue(new Error("Redis error"));

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(-1);
		});
	});

	describe("disconnect", () => {
		it("should call connector disconnect", () => {
			backend.disconnect();
			expect(mockDisconnect).toHaveBeenCalled();
		});
	});
});
