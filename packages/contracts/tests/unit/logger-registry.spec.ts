import { describe, expect, it } from "@jest/globals";
import type { JsonObject, LoggerPort } from "../../src/logger-registry";
import { getLogger, setLogger } from "../../src/logger-registry";

describe("logger-registry", () => {
	it("returns a no-op logger before any registration", () => {
		const logger = getLogger();
		expect(() => logger.debug("noop")).not.toThrow();
		expect(() => logger.info("noop")).not.toThrow();
		expect(() => logger.warn("noop")).not.toThrow();
		expect(() => logger.error("noop")).not.toThrow();
	});

	it("returns the registered logger after setLogger", () => {
		const calls: string[] = [];
		const fake: LoggerPort = {
			debug: (message: string, context?: JsonObject) =>
				calls.push(`debug:${message}:${context?.a ?? ""}`),
			info: (message: string) => calls.push(`info:${message}`),
			warn: (message: string) => calls.push(`warn:${message}`),
			error: (message: string) => calls.push(`error:${message}`),
		};
		setLogger(fake);
		const logger = getLogger();
		expect(logger).toBe(fake);
		logger.debug("d", { a: 1 });
		logger.info("i");
		logger.warn("w");
		logger.error("e");
		expect(calls).toEqual(["debug:d:1", "info:i", "warn:w", "error:e"]);
	});
});
