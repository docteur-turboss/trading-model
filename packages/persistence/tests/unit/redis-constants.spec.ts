import { describe, expect, it } from "@jest/globals";
import { RedisStatus } from "../../src/redis-constants";

describe("redis constants", () => {
	it("should match the ioredis status string", () => {
		expect(RedisStatus.READY).toBe("ready");
	});
});
