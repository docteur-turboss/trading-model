import {
	removeProcessHandlers,
	setupProcessHandlers,
} from "../src/infrastructure/signal-handler";

describe("signal-handler", () => {
	beforeEach(() => {
		removeProcessHandlers();
		jest.restoreAllMocks();
	});

	describe("setupProcessHandlers", () => {
		it("should register handlers on process (SIGTERM, SIGINT, uncaughtException, unhandledRejection)", () => {
			const onSpy = jest.spyOn(process, "on");

			const shutdown = jest.fn();
			const hardShutdown = jest.fn();

			setupProcessHandlers(shutdown, hardShutdown);

			expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
			expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
			expect(onSpy).toHaveBeenCalledWith(
				"uncaughtException",
				expect.any(Function)
			);
			expect(onSpy).toHaveBeenCalledWith(
				"unhandledRejection",
				expect.any(Function)
			);
			expect(onSpy).toHaveBeenCalledTimes(4);
		});

		it("should be idempotent when called twice", () => {
			const onSpy = jest.spyOn(process, "on");

			const shutdown = jest.fn();
			const hardShutdown = jest.fn();

			setupProcessHandlers(shutdown, hardShutdown);
			setupProcessHandlers(shutdown, hardShutdown);

			expect(onSpy).toHaveBeenCalledTimes(4);
		});

		it("should trigger shutdown callback on SIGTERM", () => {
			const shutdown = jest.fn();
			const hardShutdown = jest.fn();

			const handlers: Array<() => void> = [];
			jest
				.spyOn(process, "on")
				.mockImplementation((event: string, handler: () => void) => {
					if (
						[
							"SIGTERM",
							"SIGINT",
							"uncaughtException",
							"unhandledRejection",
						].includes(event)
					) {
						handlers.push(handler);
					}
					return process;
				});

			setupProcessHandlers(shutdown, hardShutdown);

			const sigtermHandler = handlers[0];
			sigtermHandler();

			expect(shutdown).toHaveBeenCalledWith("SIGTERM");
		});

		it("should trigger hardShutdown on uncaughtException", () => {
			const shutdown = jest.fn();
			const hardShutdown = jest.fn();

			const handlers: Array<(arg?: unknown) => void> = [];
			jest
				.spyOn(process, "on")
				.mockImplementation(
					(event: string, handler: (arg?: unknown) => void) => {
						if (
							[
								"SIGTERM",
								"SIGINT",
								"uncaughtException",
								"unhandledRejection",
							].includes(event)
						) {
							handlers.push(handler);
						}
						return process;
					}
				);

			setupProcessHandlers(shutdown, hardShutdown);

			const uncaughtExceptionHandler = handlers[2];
			uncaughtExceptionHandler(new Error("test error"));

			expect(hardShutdown).toHaveBeenCalledWith(1);
		});

		it("should trigger hardShutdown on unhandledRejection", () => {
			const origExit = process.exit;
			process.exit = jest.fn() as never;

			const shutdown = jest.fn();
			const hardShutdown = jest.fn();

			const handlers: Array<(arg?: unknown) => void> = [];
			jest
				.spyOn(process, "on")
				.mockImplementation(
					(event: string, handler: (arg?: unknown) => void) => {
						if (
							[
								"SIGTERM",
								"SIGINT",
								"uncaughtException",
								"unhandledRejection",
							].includes(event)
						) {
							handlers.push(handler);
						}
						return process;
					}
				);

			setupProcessHandlers(shutdown, hardShutdown);

			const unhandledRejectionHandler = handlers[3];
			unhandledRejectionHandler("test reason");

			expect(hardShutdown).toHaveBeenCalledWith(1);

			process.exit = origExit;
		});
	});

	describe("removeProcessHandlers", () => {
		it("should remove all registered listeners and reset state", () => {
			const removeSpy = jest.spyOn(process, "removeListener");

			const shutdown = jest.fn();
			const hardShutdown = jest.fn();
			setupProcessHandlers(shutdown, hardShutdown);

			removeProcessHandlers();

			expect(removeSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
			expect(removeSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
			expect(removeSpy).toHaveBeenCalledWith(
				"uncaughtException",
				expect.any(Function)
			);
			expect(removeSpy).toHaveBeenCalledWith(
				"unhandledRejection",
				expect.any(Function)
			);
		});

		it("should allow re-registration after removal", () => {
			const onSpy = jest.spyOn(process, "on");

			const shutdown = jest.fn();
			const hardShutdown = jest.fn();

			setupProcessHandlers(shutdown, hardShutdown);
			removeProcessHandlers();
			setupProcessHandlers(shutdown, hardShutdown);

			expect(onSpy).toHaveBeenCalledTimes(8);
		});
	});
});
