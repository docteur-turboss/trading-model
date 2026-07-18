import type http from "node:http";
import {
	gracefulShutdown,
	hardShutdown,
} from "../src/server/bootstrap-shutdown";

function createMockServer() {
	return {
		close: jest.fn().mockResolvedValue(undefined),
		raw: {} as http.Server,
	};
}

function createOptions(overrides: Record<string, unknown> = {}) {
	return {
		name: "test-service",
		createServer: jest.fn().mockReturnValue(createMockServer()),
		...overrides,
	};
}

describe("hardShutdown", () => {
	let originalExitCode: number;

	beforeEach(() => {
		originalExitCode = process.exitCode;
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it("should handle null server gracefully", () => {
		const options = createOptions();

		hardShutdown(0, null, options);

		expect(process.exitCode).toBe(0);
	});

	it("should close the server when provided", () => {
		const server = createMockServer();
		const options = createOptions();

		hardShutdown(1, server, options);

		expect(server.close).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should call the onStop callback", () => {
		const onStop = jest.fn();
		const options = createOptions({ onStop });

		hardShutdown(0, null, options);

		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(0);
	});

	it("should set exit code", () => {
		const options = createOptions();

		hardShutdown(42, null, options);

		expect(process.exitCode).toBe(42);
	});
});

describe("gracefulShutdown", () => {
	let originalExitCode: number;

	beforeEach(() => {
		originalExitCode = process.exitCode;
		jest.useRealTimers();
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
	});

	it("should close the server and call onStop when shutdown succeeds", async () => {
		const server = createMockServer();
		const onStop = jest.fn();
		const options = createOptions({ onStop });

		await gracefulShutdown("SIGTERM", server, options);

		expect(server.close).toHaveBeenCalled();
		expect(onStop).toHaveBeenCalled();
		expect(process.exitCode).toBe(originalExitCode);
	});

	it("should handle null server gracefully", async () => {
		const onStop = jest.fn();
		const options = createOptions({ onStop });

		await gracefulShutdown("SIGTERM", null, options);

		expect(onStop).toHaveBeenCalled();
	});

	it("should fall back to hardShutdown when server close throws", async () => {
		const server = {
			close: jest.fn().mockRejectedValue(new Error("close failed")),
			raw: {} as http.Server,
		};
		const onStop = jest.fn();
		const options = createOptions({ onStop });

		await gracefulShutdown("SIGTERM", server, options);

		expect(server.close).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("should fall back to hardShutdown when server close times out", async () => {
		jest.useFakeTimers();

		const server = {
			close: jest.fn().mockReturnValue(new Promise<never>(() => {})),
			raw: {} as http.Server,
		};
		const options = createOptions();

		const promise = gracefulShutdown("SIGTERM", server, options);

		jest.advanceTimersByTime(10000);

		await promise;

		expect(process.exitCode).toBe(1);
		jest.useRealTimers();
	});
});
