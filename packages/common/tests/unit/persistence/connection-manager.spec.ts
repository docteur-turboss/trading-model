import { describe, expect, it, jest } from "@jest/globals";
import {
	ConnectionManager,
	DEFAULT_CONNECTION_OPTIONS,
} from "../../../src/persistence/connection-manager";

describe("ConnectionManager", () => {
	it("should have default options", () => {
		expect(DEFAULT_CONNECTION_OPTIONS.maxRetries).toBe(10);
		expect(DEFAULT_CONNECTION_OPTIONS.baseDelayMs).toBe(1000);
		expect(DEFAULT_CONNECTION_OPTIONS.maxDelayMs).toBe(30000);
	});

	it("should call connectFn and cache connection", async () => {
		const connectFn = jest
			.fn<() => Promise<string>>()
			.mockResolvedValue("connected");
		const disconnectFn = jest
			.fn<(conn: string) => Promise<void>>()
			.mockResolvedValue(undefined);
		const cm = new ConnectionManager<string>(connectFn, disconnectFn);

		const conn1 = await cm.getConnection();
		const conn2 = await cm.getConnection();

		expect(conn1).toBe("connected");
		expect(conn2).toBe("connected");
		expect(connectFn).toHaveBeenCalledTimes(1);
	});

	it("should return null client before connection", () => {
		const cm = new ConnectionManager<string>(
			jest.fn<() => Promise<string>>().mockResolvedValue("conn"),
			jest.fn<(conn: string) => Promise<void>>().mockResolvedValue(undefined)
		);
		expect(cm.getClient()).toBeNull();
	});

	it("should report isConnected after connection", async () => {
		const cm = new ConnectionManager<string>(
			jest.fn<() => Promise<string>>().mockResolvedValue("conn"),
			jest.fn<(conn: string) => Promise<void>>().mockResolvedValue(undefined)
		);
		expect(cm.isConnected()).toBe(false);
		await cm.getConnection();
		expect(cm.isConnected()).toBe(true);
	});

	it("should reset state and disconnect", async () => {
		const disconnectFn = jest
			.fn<(conn: string) => Promise<void>>()
			.mockResolvedValue(undefined);
		const cm = new ConnectionManager<string>(
			jest.fn<() => Promise<string>>().mockResolvedValue("conn"),
			disconnectFn
		);
		await cm.getConnection();
		await cm.resetState();
		expect(disconnectFn).toHaveBeenCalledWith("conn");
		expect(cm.isConnected()).toBe(false);
	});

	it("should close and disconnect", async () => {
		const disconnectFn = jest
			.fn<(conn: string) => Promise<void>>()
			.mockResolvedValue(undefined);
		const cm = new ConnectionManager<string>(
			jest.fn<() => Promise<string>>().mockResolvedValue("conn"),
			disconnectFn
		);
		await cm.getConnection();
		await cm.close();
		expect(disconnectFn).toHaveBeenCalledWith("conn");
		expect(cm.getClient()).toBeNull();
	});

	it("should handle disconnect errors gracefully", async () => {
		const disconnectFn = jest
			.fn<(conn: string) => Promise<void>>()
			.mockRejectedValue(new Error("disconnect error"));
		const cm = new ConnectionManager<string>(
			jest.fn<() => Promise<string>>().mockResolvedValue("conn"),
			disconnectFn
		);
		await cm.getConnection();
		await cm.close();
	});
});
