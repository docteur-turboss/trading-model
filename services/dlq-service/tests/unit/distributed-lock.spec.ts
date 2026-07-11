import { describe, expect, it, jest } from "@jest/globals";
import {
	REDIS_RESP,
	REDIS_SET,
} from "@trading-model/common/persistence/redis-constants";

const MOCK_SET = jest.fn();
const MOCK_EVAL = jest.fn();

const mockRedis = {
	set: MOCK_SET,
	eval: MOCK_EVAL,
} as unknown as import("ioredis").Redis;

describe("DistributedLock", () => {
	let DistributedLockClass: new (
		redis: import("ioredis").Redis,
		lockName: string
	) => {
		acquire: (instanceId: string) => Promise<boolean>;
		release: (instanceId: string) => Promise<void>;
	};

	beforeAll(() => {
		const mod = jest.requireActual("../../src/config/distributed-lock");
		DistributedLockClass = mod.DistributedLock;
	});

	beforeEach(() => {
		MOCK_SET.mockReset();
		MOCK_EVAL.mockReset();
	});

	describe("acquire", () => {
		it("should return true when lock is acquired", async () => {
			MOCK_SET.mockResolvedValue(REDIS_RESP.OK);
			const lock = new DistributedLockClass(mockRedis, "test-lock");
			const result = await lock.acquire("instance-1");
			await lock.release("instance-1");
			expect(result).toBe(true);
			expect(MOCK_SET).toHaveBeenCalledWith(
				"dlq:lock:test-lock",
				"instance-1",
				REDIS_SET.EX,
				30,
				REDIS_SET.NX
			);
		});

		it("should return false when lock is already held", async () => {
			MOCK_SET.mockResolvedValue(null);
			const lock = new DistributedLockClass(mockRedis, "test-lock");
			const result = await lock.acquire("instance-2");
			expect(result).toBe(false);
		});
	});

	describe("release", () => {
		it("should release the lock via Lua script", async () => {
			MOCK_EVAL.mockResolvedValue(1);
			const lock = new DistributedLockClass(mockRedis, "test-lock");
			await lock.release("instance-1");
			expect(MOCK_EVAL).toHaveBeenCalledWith(
				expect.any(String),
				1,
				"dlq:lock:test-lock",
				"instance-1"
			);
		});
	});
});
