import { describe, expect, it, jest } from "@jest/globals";
import { logger } from "@trading-model/http/logger";
import { z } from "zod";
import { BaseEnvSchema } from "../../../src/config/env";
import { validateEnv } from "../../../src/config/validate-env";

describe("BaseEnvSchema", () => {
	it("uses defaults for optional fields", () => {
		const result = BaseEnvSchema.parse({
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
		});
		expect(result.PORT).toBe(3000);
		expect(result.LOG_LEVEL).toBe("info");
		expect(result.NODE_ENV).toBe("development");
	});

	it("parses valid input with all fields", () => {
		const result = BaseEnvSchema.parse({
			NODE_ENV: "production",
			PORT: "443",
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
			LOG_LEVEL: "error",
		});
		expect(result.NODE_ENV).toBe("production");
		expect(result.PORT).toBe(443);
		expect(result.LOG_LEVEL).toBe("error");
	});

	it("accepts LOG_LEVEL in any case, like the global logger", () => {
		const result = BaseEnvSchema.parse({
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
			LOG_LEVEL: "DEBUG",
		});
		expect(result.LOG_LEVEL).toBe("debug");
	});

	it("rejects invalid NODE_ENV", () => {
		expect(() =>
			BaseEnvSchema.parse({
				NODE_ENV: "invalid",
				TLS_KEY_PATH: "/key.pem",
				TLS_CERT_PATH: "/cert.pem",
				TLS_CA_PATH: "/ca.pem",
			})
		).toThrow();
	});

	it("rejects non-positive PORT", () => {
		expect(() =>
			BaseEnvSchema.parse({
				PORT: "0",
				TLS_KEY_PATH: "/key.pem",
				TLS_CERT_PATH: "/cert.pem",
				TLS_CA_PATH: "/ca.pem",
			})
		).toThrow();
	});

	it("rejects empty TLS paths", () => {
		expect(() =>
			BaseEnvSchema.parse({
				TLS_KEY_PATH: "",
				TLS_CERT_PATH: "/cert.pem",
				TLS_CA_PATH: "/ca.pem",
			})
		).toThrow();
	});
});

describe("validateEnv", () => {
	it("returns parsed data on success", () => {
		process.env.TLS_KEY_PATH = "/key.pem";
		process.env.TLS_CERT_PATH = "/cert.pem";
		process.env.TLS_CA_PATH = "/ca.pem";
		const result = validateEnv(BaseEnvSchema);
		expect(result).toBeDefined();
		expect(result.TLS_KEY_PATH).toBe("/key.pem");
	});

	it("logs the field errors and throws a configuration error on failure", () => {
		const error = jest.spyOn(logger, "error").mockImplementation(() => {
			// silenced: the call itself is asserted
		});
		const schema = z.object({ REQUIRED_FOR_TEST: z.string() });

		expect(() => validateEnv(schema)).toThrow("Environment validation failed");
		expect(error).toHaveBeenCalledWith("Invalid environment configuration", {
			issues: [expect.objectContaining({ path: "REQUIRED_FOR_TEST" })],
		});
		error.mockRestore();
	});
});
