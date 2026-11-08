import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("fs", () => ({
	existsSync: jest.fn().mockReturnValue(false),
	mkdirSync: jest.fn(),
	writeFile: jest.fn(),
}));

const OLD_ENV = process.env.NODE_ENV;
const OLD_LOG_LEVEL = process.env.LOG_LEVEL;

function loadLogger(): {
	logger: any;
	LogLevel: any;
} {
	let loaded: any;
	jest.isolateModules(() => {
		loaded = require("@trading-model/http/application/services/logger");
	});
	return loaded;
}

describe("logger singleton", () => {
	beforeEach(() => {
		delete process.env.LOG_LEVEL;
	});

	afterEach(() => {
		process.env.NODE_ENV = OLD_ENV;
		if (OLD_LOG_LEVEL === undefined) {
			delete process.env.LOG_LEVEL;
		} else {
			process.env.LOG_LEVEL = OLD_LOG_LEVEL;
		}
		jest.restoreAllMocks();
		jest.resetModules();
	});

	it("should create DEBUG level logger in development", () => {
		process.env.NODE_ENV = "development";
		jest.isolateModules(() => {
			const {
				logger: devLogger,
				LogLevel,
			} = require("@trading-model/http/application/services/logger");
			expect((devLogger as any)._logLevel).toBe(LogLevel.Debug);
		});
	});

	it("should create INFO level logger in staging", () => {
		process.env.NODE_ENV = "staging";
		jest.isolateModules(() => {
			const {
				logger: stagingLogger,
				LogLevel,
			} = require("@trading-model/http/application/services/logger");
			expect((stagingLogger as any)._logLevel).toBe(LogLevel.Info);
		});
	});

	it("should create WARN level logger in production", () => {
		process.env.NODE_ENV = "production";
		jest.isolateModules(() => {
			const {
				logger: prodLogger,
				LogLevel,
			} = require("@trading-model/http/application/services/logger");
			expect((prodLogger as any)._logLevel).toBe(LogLevel.Warn);
		});
	});

	it("should create DEBUG level logger when NODE_ENV is not set", () => {
		delete process.env.NODE_ENV;
		jest.isolateModules(() => {
			const {
				logger: defaultLogger,
				LogLevel,
			} = require("@trading-model/http/application/services/logger");
			expect((defaultLogger as any)._logLevel).toBe(LogLevel.Debug);
		});
	});

	it("should write INFO in production when LOG_LEVEL is info", () => {
		process.env.NODE_ENV = "production";
		process.env.LOG_LEVEL = "info";
		const info = jest.spyOn(console, "info").mockImplementation(() => {});
		const { logger } = loadLogger();
		logger.info("Service started successfully");
		expect(info).toHaveBeenCalledTimes(1);
		expect(String(info.mock.calls[0][0])).toContain(
			"Service started successfully"
		);
	});

	it("should accept LOG_LEVEL in any case", () => {
		process.env.NODE_ENV = "production";
		process.env.LOG_LEVEL = "DEBUG";
		const { logger, LogLevel } = loadLogger();
		expect(logger._logLevel).toBe(LogLevel.Debug);
	});

	it("should hide WARN when LOG_LEVEL is error", () => {
		process.env.NODE_ENV = "development";
		process.env.LOG_LEVEL = "error";
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		const { logger } = loadLogger();
		logger.warn("hidden");
		expect(warn).not.toHaveBeenCalled();
	});

	it("should fall back to the NODE_ENV default and warn on an invalid LOG_LEVEL", () => {
		process.env.NODE_ENV = "production";
		process.env.LOG_LEVEL = "verbose";
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		const { logger, LogLevel } = loadLogger();
		expect(logger._logLevel).toBe(LogLevel.Warn);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0])).toContain("Invalid LOG_LEVEL");
		expect(String(warn.mock.calls[0][0])).toContain("verbose");
	});
});
