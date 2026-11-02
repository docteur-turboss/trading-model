import { describe, expect, it, jest } from "@jest/globals";

import { NoopLogger } from "../../src/domain/logger-port";

describe("logger-port", () => {
	it("NoopLogger exposes all four no-op methods", () => {
		const spy = jest.spyOn(console, "log").mockImplementation(() => {});

		expect(() => {
			NoopLogger.debug("debug", { a: 1 });
			NoopLogger.info("info", { a: 1 });
			NoopLogger.warn("warn", { a: 1 });
			NoopLogger.error("error", { a: 1 });
		}).not.toThrow();

		spy.mockRestore();
	});
});
