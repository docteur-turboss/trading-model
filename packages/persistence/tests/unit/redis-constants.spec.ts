import { describe, expect, it } from "@jest/globals";
import { RedisResp, RedisSet, RedisStatus } from "../../src/redis-constants";

describe("redis constants", () => {
	it("should match the ioredis status and reply strings", () => {
		expect(RedisStatus.READY).toBe("ready");
		expect(RedisResp.OK).toBe("OK");
		expect(RedisSet.NX).toBe("NX");
	});
});
