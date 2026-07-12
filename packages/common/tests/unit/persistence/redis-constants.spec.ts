import { describe, expect, it } from "@jest/globals";
import {
	RedisMode,
	RedisResp,
	RedisSet,
	RedisStatus,
} from "../../../src/persistence/redis-constants";

describe("RedisStatus", () => {
	it("should have correct values", () => {
		expect(RedisStatus.READY).toBe("ready");
		expect(RedisStatus.CONNECTING).toBe("connecting");
		expect(RedisStatus.RECONNECTING).toBe("reconnecting");
		expect(RedisStatus.CLOSE).toBe("close");
	});
});

describe("RedisResp", () => {
	it("should have correct values", () => {
		expect(RedisResp.OK).toBe("OK");
		expect(RedisResp.PONG).toBe("PONG");
	});
});

describe("RedisSet", () => {
	it("should have correct values", () => {
		expect(RedisSet.NX).toBe("NX");
		expect(RedisSet.XX).toBe("XX");
		expect(RedisSet.EX).toBe("EX");
		expect(RedisSet.PX).toBe("PX");
	});
});

describe("RedisMode", () => {
	it("should have correct values", () => {
		expect(RedisMode.SINGLE).toBe("single");
		expect(RedisMode.SENTINEL).toBe("sentinel");
		expect(RedisMode.CLUSTER).toBe("cluster");
	});
});
