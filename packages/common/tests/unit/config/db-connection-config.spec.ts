import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createDbConfigFromEnv } from "../../../src/config/db-connection-config";

describe("createDbConfigFromEnv", () => {
	const OLD_ENV = process.env;

	beforeEach(() => {
		process.env = { ...OLD_ENV };
		delete process.env.DB_HOST;
		delete process.env.DB_PORT;
		delete process.env.DB_USER;
		delete process.env.DB_PASSWORD;
		delete process.env.DB_NAME;
		delete process.env.DB_SSL_CA;
		delete process.env.DB_SSL_CERT;
		delete process.env.DB_SSL_KEY;
	});

	afterEach(() => {
		process.env = OLD_ENV;
	});

	it("should create config with defaults and env", () => {
		process.env.DB_PASSWORD = "pass";
		const config = createDbConfigFromEnv();
		expect(config.host).toBe("127.0.0.1");
		expect(config.port).toBe(3306);
		expect(config.user).toBe("root");
		expect(config.password).toBe("pass");
		expect(config.database).toBe("financial_scraper");
	});

	it("should default to empty password when DB_PASSWORD is unset", () => {
		const config = createDbConfigFromEnv();
		expect(config.password).toBe("");
	});

	it("should apply overrides", () => {
		process.env.DB_PASSWORD = "pass";
		const config = createDbConfigFromEnv({
			host: "10.0.0.1" as never,
			port: 5432 as never,
		});
		expect(config.host).toBe("10.0.0.1");
		expect(config.port).toBe(5432);
	});

	it("should read from environment variables", () => {
		process.env.DB_HOST = "192.168.1.1";
		process.env.DB_PORT = "5432";
		process.env.DB_USER = "admin";
		process.env.DB_PASSWORD = "secret";
		process.env.DB_NAME = "test_db";

		const config = createDbConfigFromEnv();
		expect(config.host).toBe("192.168.1.1");
		expect(config.port).toBe(5432);
		expect(config.user).toBe("admin");
		expect(config.password).toBe("secret");
		expect(config.database).toBe("test_db");
	});

	it("should have no ssl option without DB_SSL_CA", () => {
		expect(createDbConfigFromEnv().ssl).toBeUndefined();
	});

	it("should load the CA of DB_SSL_CA", () => {
		const dir = mkdtempSync(join(tmpdir(), "db-ca-"));
		const path = join(dir, "ca.crt");
		writeFileSync(path, "PEM");
		process.env.DB_SSL_CA = path;
		expect(createDbConfigFromEnv().ssl).toEqual({ ca: "PEM" });
		rmSync(dir, { recursive: true });
	});

	it("should load the client certificate of DB_SSL_CERT / DB_SSL_KEY", () => {
		const dir = mkdtempSync(join(tmpdir(), "db-cert-"));
		for (const [name, body] of [
			["ca.crt", "CA"],
			["tls.crt", "CERT"],
			["tls.key", "KEY"],
		]) {
			writeFileSync(join(dir, name), body);
		}
		process.env.DB_SSL_CA = join(dir, "ca.crt");
		process.env.DB_SSL_CERT = join(dir, "tls.crt");
		process.env.DB_SSL_KEY = join(dir, "tls.key");
		expect(createDbConfigFromEnv().ssl).toEqual({
			ca: "CA",
			cert: "CERT",
			key: "KEY",
		});
		rmSync(dir, { recursive: true });
	});

	it("should throw when only one of DB_SSL_CERT / DB_SSL_KEY is set", () => {
		process.env.DB_SSL_CERT = "/x/tls.crt";
		expect(() => createDbConfigFromEnv()).toThrow(/together/);
	});

	it("should throw when the CA file is unreadable", () => {
		process.env.DB_SSL_CA = "/nonexistent/ca.crt";
		expect(() => createDbConfigFromEnv()).toThrow(/ENOENT/);
	});
});
