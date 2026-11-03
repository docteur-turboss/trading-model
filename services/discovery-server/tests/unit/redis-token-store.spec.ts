import { describe, expect, it, jest } from "@jest/globals";
import { RedisTokenStore } from "../../src/adapters/outbound/redis-token-store";

function fakeRedis() {
	const data = new Map<string, string>();
	return {
		data,
		get: jest.fn(async (key: string) => data.get(key) ?? null),
		set: jest.fn(async (key: string, value: string) => {
			data.set(key, value);
			return "OK";
		}),
		del: jest.fn(async (key: string) => (data.delete(key) ? 1 : 0)),
	};
}

describe("RedisTokenStore", () => {
	it("stores, reads and deletes a token under the instance token key", async () => {
		const redis = fakeRedis();
		const store = new RedisTokenStore({
			redis: redis as never,
			keyPrefix: "tm:discovery:",
		});

		await store.set("i1" as never, "token-1" as never);
		expect([...redis.data.keys()]).toEqual(["tm:discovery:instance:i1:token"]);
		expect(await store.get("i1" as never)).toBe("token-1");

		await store.delete("i1" as never);
		expect(await store.get("i1" as never)).toBeUndefined();
	});
});
