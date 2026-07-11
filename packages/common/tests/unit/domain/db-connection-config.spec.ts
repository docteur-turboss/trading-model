import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createDbConfigFromEnv } from "../../../src/domain/db-connection-config";

describe("createDbConfigFromEnv", () => {
	const OLD_ENV = process.env;

	beforeEach(() => {
		process.env = { ...OLD_ENV };
		delete process.env.DB_HOST;
		delete process.env.DB_PORT;
		delete process.env.DB_USER;
		delete process.env.DB_PASSWORD;
		delete process.env.DB_NAME;
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
		expect(config.database).toBe("trading_model");
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
});
