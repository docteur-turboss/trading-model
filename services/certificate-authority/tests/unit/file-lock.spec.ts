import path from "node:path";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();

jest.mock("node:fs/promises", () => ({
	mkdir: mockMkdir,
	readFile: mockReadFile,
	writeFile: mockWriteFile,
	unlink: mockUnlink,
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@trading-model/common/config/node-env", () => ({
	isDevelopment: jest.fn(() => true),
	getNodeEnv: jest.fn(() => "test"),
	NODE_ENV: {
		TEST: "test",
		DEVELOPMENT: "development",
		PRODUCTION: "production",
	},
}));

import { FileSystemLockBackend } from "../../src/persistence/backends/file-lock";
import type { LockContext } from "../../src/persistence/backends/lock-backend-interface";

describe("FileSystemLockBackend", () => {
	let backend: FileSystemLockBackend;
	let context: LockContext;
	const LOCK_DIR = "/tmp/locks";

	beforeEach(() => {
		jest.clearAllMocks();
		backend = new FileSystemLockBackend(LOCK_DIR);
		context = {
			lockName: "test-lock",
			instanceId: "instance-1" as any,
		};
		mockMkdir.mockResolvedValue(undefined);
	});

	describe("acquire", () => {
		it("should acquire lock when not held", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockWriteFile.mockResolvedValue(undefined);

			const token = await backend.acquire(context, 60000);
			expect(token).not.toBeNull();
			expect(typeof token).toBe("number");
			expect(mockMkdir).toHaveBeenCalledWith(LOCK_DIR, { recursive: true });
			expect(mockWriteFile).toHaveBeenCalled();
		});

		it("should return null when lock is already held", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({ acquiredAt: Date.now(), ttlMs: 60000 })
			);

			const token = await backend.acquire(context, 60000);
			expect(token).toBeNull();
		});

		it("should acquire when lock is expired", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({ acquiredAt: Date.now() - 120000, ttlMs: 60000 })
			);
			mockWriteFile.mockResolvedValue(undefined);

			const token = await backend.acquire(context, 60000);
			expect(token).not.toBeNull();
		});

		it("should return null when filesystem error occurs", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));
			mockWriteFile.mockRejectedValue(new Error("Permission denied"));

			const token = await backend.acquire(context, 60000);
			expect(token).toBeNull();
		});
	});

	describe("release", () => {
		it("should release the lock file", async () => {
			mockUnlink.mockResolvedValue(undefined);

			const result = await backend.release(context, 12345);
			expect(result).toBe(true);
			const expectedPath = path.join(LOCK_DIR, "test-lock.lock");
			expect(mockUnlink).toHaveBeenCalledWith(expectedPath);
		});

		it("should return false when unlink fails", async () => {
			mockUnlink.mockRejectedValue(new Error("ENOENT"));

			const result = await backend.release(context, 12345);
			expect(result).toBe(false);
		});
	});

	describe("verifyOwnership", () => {
		it("should return fencing token when ownership matches", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					instanceId: "instance-1",
					fencingToken: 12345,
				})
			);

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(12345);
		});

		it("should return -1 when instanceId mismatches", async () => {
			mockReadFile.mockResolvedValue(
				JSON.stringify({
					instanceId: "instance-2",
					fencingToken: 12345,
				})
			);

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(-1);
		});

		it("should return -1 when read fails", async () => {
			mockReadFile.mockRejectedValue(new Error("ENOENT"));

			const result = await backend.verifyOwnership(context, 12345);
			expect(result).toBe(-1);
		});
	});
});
