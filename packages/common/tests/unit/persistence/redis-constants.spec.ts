import { describe, expect, it } from "@jest/globals";
import {
	REDIS_RESP,
	REDIS_SET,
	REDIS_STATUS,
	RedisMode,
} from "../../../src/persistence/redis-constants";

describe("REDIS_STATUS", () => {
	it("should have correct values", () => {
		expect(REDIS_STATUS.READY).toBe("ready");
		expect(REDIS_STATUS.CONNECTING).toBe("connecting");
		expect(REDIS_STATUS.RECONNECTING).toBe("reconnecting");
		expect(REDIS_STATUS.CLOSE).toBe("close");
	});
});

describe("REDIS_RESP", () => {
	it("should have correct values", () => {
		expect(REDIS_RESP.OK).toBe("OK");
		expect(REDIS_RESP.PONG).toBe("PONG");
	});
});

describe("REDIS_SET", () => {
	it("should have correct values", () => {
		expect(REDIS_SET.NX).toBe("NX");
		expect(REDIS_SET.XX).toBe("XX");
		expect(REDIS_SET.EX).toBe("EX");
		expect(REDIS_SET.PX).toBe("PX");
	});
});

describe("RedisMode", () => {
	it("should have correct values", () => {
		expect(RedisMode.SINGLE).toBe("single");
		expect(RedisMode.SENTINEL).toBe("sentinel");
		expect(RedisMode.CLUSTER).toBe("cluster");
	});
});
