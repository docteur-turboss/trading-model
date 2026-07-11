import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockAcquire = jest.fn();
const mockRelease = jest.fn();
const mockVerifyOwnership = jest.fn();

jest.mock("../../src/persistence/mongo-lock-executor", () => ({
	MongoLockExecutor: jest.fn().mockImplementation(() => ({
		acquire: mockAcquire,
		release: mockRelease,
		verifyOwnership: mockVerifyOwnership,
	})),
}));

import type { LockContext } from "../../src/persistence/backends/lock-backend-interface";
import { MongoLockBackend } from "../../src/persistence/backends/mongo-lock";

describe("MongoLockBackend", () => {
	let backend: MongoLockBackend;
	let context: LockContext;
	let mockCollection: any;
	let onDisconnect: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		onDisconnect = jest.fn();
		mockCollection = jest.fn(() => ({}));
		backend = new MongoLockBackend(mockCollection, onDisconnect);
		context = {
			lockName: "test-lock",
			instanceId: "instance-1" as any,
		};
	});

	it("should return null on acquire when not connected", async () => {
		const result = await backend.acquire(context, 60000);
		expect(result).toBeNull();
	});

	it("should acquire when connected", async () => {
		backend.setConnected(true);
		mockAcquire.mockResolvedValue(42);

		const result = await backend.acquire(context, 60000);
		expect(result).toBe(42);
	});

	it("should return -1 on acquire when executor fails but still connected", async () => {
		backend.setConnected(true);
		mockAcquire.mockResolvedValue(null);

		const result = await backend.acquire(context, 60000);
		expect(result).toBe(-1);
	});

	it("should release when connected", async () => {
		backend.setConnected(true);
		mockRelease.mockResolvedValue(true);

		const result = await backend.release(context, 42);
		expect(result).toBe(true);
	});

	it("should return false on release when not connected", async () => {
		const result = await backend.release(context, 42);
		expect(result).toBe(false);
	});

	it("should verify ownership when connected", async () => {
		backend.setConnected(true);
		mockVerifyOwnership.mockResolvedValue(42);

		const result = await backend.verifyOwnership(context, 42);
		expect(result).toBe(42);
	});

	it("should return -1 on verify ownership when not connected", async () => {
		const result = await backend.verifyOwnership(context, 42);
		expect(result).toBe(-1);
	});

	it("should call onDisconnect when executor triggers disconnect", () => {
		const executorFactory = (jest as any).requireMock(
			"../../src/persistence/mongo-lock-executor"
		).MongoLockExecutor;
		const executorCall = executorFactory.mock.calls[0];
		const disconnectCallback = executorCall[1];
		disconnectCallback();
		expect(onDisconnect).toHaveBeenCalled();
	});
});
