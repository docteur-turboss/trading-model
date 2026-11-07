import { describe, expect, it, jest } from "@jest/globals";
import {
	disconnectRedis,
	withErrorLogging,
} from "../../src/redis-client-builder";
import { RedisStatus } from "../../src/redis-constants";

class MockRedisClient {
	status = "connecting";
	private _handlers = new Map<string, (...args: unknown[]) => void>();

	on(event: string, cb: (...args: unknown[]) => void): this {
		this._handlers.set(event, cb);
		return this;
	}

	emit(event: string, ...args: unknown[]): void {
		this._handlers.get(event)?.(...args);
	}

	connect(): Promise<void> {
		return Promise.resolve();
	}

	quit(): Promise<"OK"> {
		return Promise.resolve("OK");
	}

	disconnect(): void {}
}

describe("redis-client-builder", () => {
	it("should register an error handler and return the client", () => {
		const client = new MockRedisClient();
		expect(withErrorLogging(client as never)).toBe(client);
		expect(() => client.emit("error", new Error("boom"))).not.toThrow();
	});

	it("should quit when ready", async () => {
		const client = new MockRedisClient();
		client.status = RedisStatus.READY;
		const quit = jest.spyOn(client, "quit");
		const disconnect = jest.spyOn(client, "disconnect");
		await disconnectRedis(client as never);
		expect(quit).toHaveBeenCalledTimes(1);
		expect(disconnect).not.toHaveBeenCalled();
	});

	it("should disconnect when not ready", async () => {
		const client = new MockRedisClient();
		const disconnect = jest.spyOn(client, "disconnect");
		await disconnectRedis(client as never);
		expect(disconnect).toHaveBeenCalledTimes(1);
	});

	it("should fall back to disconnect when quit fails", async () => {
		const client = new MockRedisClient();
		client.status = RedisStatus.READY;
		jest.spyOn(client, "quit").mockRejectedValue(new Error("quit failed"));
		const disconnect = jest.spyOn(client, "disconnect");
		await disconnectRedis(client as never);
		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
