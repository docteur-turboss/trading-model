import type http from "node:http";
import {
	gracefulShutdown,
	hardShutdown,
} from "../src/application/services/bootstrap-shutdown";

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
	let originalExitCode: typeof process.exitCode;

	beforeEach(() => {
		originalExitCode = process.exitCode;
		jest.useFakeTimers();
		jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it("should exit with the code after the bounded delay", () => {
		hardShutdown(1, null, createOptions());

		expect(process.exit).not.toHaveBeenCalled();
		jest.advanceTimersByTime(5000);
		expect(process.exit).toHaveBeenCalledWith(1);
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
	let originalExitCode: typeof process.exitCode;

	beforeEach(() => {
		originalExitCode = process.exitCode;
		jest.useFakeTimers();
		jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
	});

	afterEach(() => {
		process.exitCode = originalExitCode;
		jest.clearAllTimers();
		jest.useRealTimers();
		jest.restoreAllMocks();
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
		const server = {
			close: jest.fn().mockReturnValue(new Promise<never>(() => {})),
			raw: {} as http.Server,
		};
		const options = createOptions();

		const promise = gracefulShutdown("SIGTERM", server, options);

		await jest.advanceTimersByTimeAsync(10000);

		await promise;

		expect(process.exitCode).toBe(1);
	});

	it("should run beforeClose while the server still serves, then close, then onStop", async () => {
		const calls: string[] = [];
		const server = {
			close: jest.fn(async () => {
				calls.push("close");
			}),
			raw: {} as http.Server,
		};
		const options = createOptions({
			shutdown: {
				beforeClose: async () => {
					calls.push("beforeClose");
				},
			},
			onStop: async () => {
				calls.push("onStop");
			},
		});

		await gracefulShutdown("SIGTERM", server, options);

		expect(calls).toEqual(["beforeClose", "close", "onStop"]);
	});

	it("should go on closing when beforeClose fails", async () => {
		const server = createMockServer();
		const options = createOptions({
			shutdown: { beforeClose: jest.fn().mockRejectedValue(new Error("x")) },
		});

		await gracefulShutdown("SIGTERM", server, options);

		expect(server.close).toHaveBeenCalled();
		expect(process.exitCode).toBe(originalExitCode);
	});

	it("should wait closeTimeoutMs for in-flight requests", async () => {
		let finish: () => void = () => undefined;
		const server = {
			close: jest.fn(
				() =>
					new Promise<void>((resolve) => {
						finish = resolve;
					})
			),
			raw: {} as http.Server,
		};
		const options = createOptions({ shutdown: { closeTimeoutMs: 60_000 } });

		const promise = gracefulShutdown("SIGTERM", server, options);
		await jest.advanceTimersByTimeAsync(30_000);
		finish();
		await promise;

		expect(process.exitCode).toBe(originalExitCode);
	});

	it("should wait for an async onStop", async () => {
		let stopped = false;
		const options = createOptions({
			onStop: async () => {
				await Promise.resolve();
				stopped = true;
			},
		});

		await gracefulShutdown("SIGTERM", null, options);

		expect(stopped).toBe(true);
	});

	it("should log, not fail, when onStop rejects", async () => {
		const options = createOptions({
			onStop: jest.fn().mockRejectedValue(new Error("stop failed")),
		});

		await gracefulShutdown("SIGTERM", null, options);

		expect(process.exitCode).toBe(originalExitCode);
	});
});
