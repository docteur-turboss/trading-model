import { describe, expect, it, jest } from "@jest/globals";
import { RedisClientBuilder } from "../../../src/persistence/redis-client-builder";
import { RedisStatus } from "../../../src/persistence/redis-constants";

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

describe("RedisClientBuilder", () => {
	it("should register an error handler and chain", () => {
		const client = new MockRedisClient();
		const builder = new RedisClientBuilder(client as never);
		expect(builder.withErrorHandler()).toBe(builder);
		expect(() => client.emit("error", new Error("boom"))).not.toThrow();
	});

	it("should return the underlying client on build", () => {
		const client = new MockRedisClient();
		const builder = new RedisClientBuilder(client as never);
		expect(builder.build()).toBe(client);
	});

	it("should connect the client", async () => {
		const client = new MockRedisClient();
		const connect = jest.spyOn(client, "connect");
		await RedisClientBuilder.connect(client as never);
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it("should quit when ready", async () => {
		const client = new MockRedisClient();
		client.status = RedisStatus.READY;
		const quit = jest.spyOn(client, "quit");
		const disconnect = jest.spyOn(client, "disconnect");
		await RedisClientBuilder.disconnect(client as never);
		expect(quit).toHaveBeenCalledTimes(1);
		expect(disconnect).not.toHaveBeenCalled();
	});

	it("should disconnect when not ready", async () => {
		const client = new MockRedisClient();
		client.status = RedisStatus.CONNECTING;
		const disconnect = jest.spyOn(client, "disconnect");
		await RedisClientBuilder.disconnect(client as never);
		expect(disconnect).toHaveBeenCalledTimes(1);
	});

	it("should fall back to disconnect when quit fails", async () => {
		const client = new MockRedisClient();
		client.status = RedisStatus.READY;
		jest.spyOn(client, "quit").mockRejectedValue(new Error("quit failed"));
		const disconnect = jest.spyOn(client, "disconnect");
		await RedisClientBuilder.disconnect(client as never);
		expect(disconnect).toHaveBeenCalledTimes(1);
	});
});
