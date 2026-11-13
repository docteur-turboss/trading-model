import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	Logger,
	LogLevel,
} from "@trading-model/http/application/services/logger";

describe("Logger", () => {
	let logger: Logger;
	let consoleDebugSpy: jest.SpiedFunction<typeof console.debug>;
	let consoleInfoSpy: jest.SpiedFunction<typeof console.info>;
	let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

	let originalNodeEnv: string | undefined;

	beforeEach(() => {
		originalNodeEnv = process.env.NODE_ENV;
		consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
		consoleInfoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		logger = new Logger(LogLevel.Debug);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		process.env.NODE_ENV = originalNodeEnv;
	});

	describe("constructor", () => {
		it("should create a logger with default INFO level", () => {
			const defaultLogger = new Logger();
			defaultLogger.debug("test");
			expect(consoleDebugSpy).not.toHaveBeenCalled();
		});

		it("should create a logger with DEBUG level", () => {
			logger.debug("debug message");
			expect(consoleDebugSpy).toHaveBeenCalled();
		});
	});

	describe("debug", () => {
		it("should log debug messages when level is DEBUG", () => {
			logger.debug("test debug");
			expect(consoleDebugSpy).toHaveBeenCalledWith(
				expect.stringContaining('"level":"DEBUG"')
			);
		});

		it("should NOT log debug messages when level is INFO", () => {
			const infoLogger = new Logger(LogLevel.Info);
			infoLogger.debug("should not appear");
			expect(consoleDebugSpy).not.toHaveBeenCalled();
		});
	});

	describe("info", () => {
		it("should log info messages", () => {
			logger.info("test info");
			expect(consoleInfoSpy).toHaveBeenCalledWith(
				expect.stringContaining('"level":"INFO"')
			);
		});

		it("should NOT log info messages when level is WARN", () => {
			const warnLogger = new Logger(LogLevel.Warn);
			warnLogger.info("should not appear");
			expect(consoleInfoSpy).not.toHaveBeenCalled();
		});
	});

	describe("warn", () => {
		it("should log warn messages", () => {
			logger.warn("test warn");
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining('"level":"WARN"')
			);
		});

		it("should NOT log warn messages when level is ERROR", () => {
			const errorLogger = new Logger(LogLevel.Error);
			errorLogger.warn("should not appear");
			expect(consoleWarnSpy).not.toHaveBeenCalled();
		});
	});

	describe("error", () => {
		it("should log error messages", () => {
			logger.error("test error");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('"level":"ERROR"')
			);
		});

		it("should not log error when logLevel is above ERROR", () => {
			(logger as any)._logLevel = "none";
			logger.error("should not appear");
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});
	});

	describe("error with production NODE_ENV", () => {
		it("should attempt to send error to external service in production", () => {
			process.env.NODE_ENV = "production";
			process.env.ERROR_URL_WEBHOOK = "https://webhook.example.com";
			const fetchSpy = jest
				.spyOn(globalThis, "fetch" as any)
				.mockResolvedValue({ ok: true } as any);
			const prodLogger = new Logger(LogLevel.Error);
			prodLogger.error("prod error");
			expect(fetchSpy).toHaveBeenCalled();
			fetchSpy.mockRestore();
			delete process.env.ERROR_URL_WEBHOOK;
		});

		it("should handle fetch failure gracefully", () => {
			process.env.NODE_ENV = "production";
			process.env.ERROR_URL_WEBHOOK = "https://webhook.example.com";
			const fetchSpy = jest
				.spyOn(globalThis, "fetch" as any)
				.mockRejectedValue(new Error("network error"));
			const prodLogger = new Logger(LogLevel.Error);
			expect(() => prodLogger.error("prod error")).not.toThrow();
			fetchSpy.mockRestore();
			delete process.env.ERROR_URL_WEBHOOK;
		});
	});

	describe("sendToErrorService with ERROR_URL_WEBHOOK", () => {
		it("should use ERROR_URL_WEBHOOK env var when set", () => {
			process.env.NODE_ENV = "production";
			process.env.ERROR_URL_WEBHOOK = "https://webhook.example.com";
			const fetchSpy = jest
				.spyOn(globalThis, "fetch" as any)
				.mockResolvedValue({ ok: true } as any);
			const prodLogger = new Logger(LogLevel.Error);
			prodLogger.error("webhook test");
			expect(fetchSpy).toHaveBeenCalledWith(
				"https://webhook.example.com",
				expect.anything()
			);
			fetchSpy.mockRestore();
			delete process.env.ERROR_URL_WEBHOOK;
		});

		it("should send nothing when ERROR_URL_WEBHOOK is empty", () => {
			process.env.NODE_ENV = "production";
			process.env.ERROR_URL_WEBHOOK = "";
			const fetchSpy = jest
				.spyOn(globalThis, "fetch" as any)
				.mockResolvedValue({ ok: true } as any);
			const prodLogger = new Logger(LogLevel.Error);
			prodLogger.error("no webhook");
			expect(fetchSpy).not.toHaveBeenCalled();
			fetchSpy.mockRestore();
			delete process.env.ERROR_URL_WEBHOOK;
		});
	});

	describe("safeStringify", () => {
		it("should handle circular references gracefully", async () => {
			consoleInfoSpy.mockClear();

			const obj: Record<string, unknown> = { name: "parent" };
			obj.self = obj;

			logger.info("circular test", { context: obj });

			expect(consoleInfoSpy).toHaveBeenCalled();
			const writtenData = consoleInfoSpy.mock.calls[0][0] as string;
			expect(writtenData).toContain("[Circular]");
		});

		it("should redact sensitive keys like password, token, secret, authorization", async () => {
			consoleInfoSpy.mockClear();

			const context = {
				password: "supersecret",
				token: "abc123",
				secret: "my-secret",
				authorization: "Bearer xyz",
				normalKey: "visible",
			};

			logger.info("test sensitive redaction", { context });

			expect(consoleInfoSpy).toHaveBeenCalled();
			const writtenData = consoleInfoSpy.mock.calls[0][0] as string;
			expect(writtenData).toContain('"[REDACTED]"');
			expect(writtenData).not.toContain("supersecret");
			expect(writtenData).not.toContain("abc123");
			expect(writtenData).not.toContain("my-secret");
			expect(writtenData).not.toContain("Bearer xyz");
			expect(writtenData).toContain("visible");
		});

		it("should redact TLS and certificate-related keys", async () => {
			consoleInfoSpy.mockClear();

			const context = {
				tlsKey: "server-key-content",
				tlsCert: "server-cert-content",
				tlsCa: "ca-cert-content",
				certificatePath: "/certs/client.crt",
				keyCertificatePath: "/certs/client.key",
				rootCACertPath: "/certs/ca.crt",
				apiSecret: "my-api-token",
				db_password: "db-pass-123",
				normalField: "visible",
			};

			logger.info("test tls redaction", { context });

			expect(consoleInfoSpy).toHaveBeenCalled();
			const writtenData = consoleInfoSpy.mock.calls[0][0] as string;
			expect(writtenData).not.toContain("server-key-content");
			expect(writtenData).not.toContain("server-cert-content");
			expect(writtenData).not.toContain("ca-cert-content");
			expect(writtenData).not.toContain("/certs/client.crt");
			expect(writtenData).not.toContain("/certs/client.key");
			expect(writtenData).not.toContain("/certs/ca.crt");
			expect(writtenData).not.toContain("my-api-token");
			expect(writtenData).not.toContain("db-pass-123");
			expect(writtenData).toContain("visible");
		});
	});
});
