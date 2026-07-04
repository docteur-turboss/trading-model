import { describe, expect, it, jest } from "@jest/globals";

const REQUIRED_ENV: Record<string, string> = {
	NODE_ENV: "test",
	TLS_KEY_PATH: "/some/key.pem",
	TLS_CERT_PATH: "/some/cert.pem",
	TLS_CA_PATH: "/some/ca.pem",
	APP_NAME: "audit-logger",
	SERVICE_NAME: "audit",
	INSTANCE_ID: "instance-1",
	ADDRESS_MANAGER_URL: "https://address-manager:3000",
};

describe("env validation", () => {
	it("should succeed when all required env vars are set", () => {
		jest.isolateModules(() => {
			Object.assign(process.env, REQUIRED_ENV);

			const { ENV } = require("../../../src/config/env") as {
				ENV: Record<string, unknown>;
			};

			expect(ENV.NODE_ENV).toBe("test");
			expect(ENV.TLS_KEY_PATH).toBe("/some/key.pem");
			expect(ENV.TLS_CERT_PATH).toBe("/some/cert.pem");
			expect(ENV.TLS_CA_PATH).toBe("/some/ca.pem");
			expect(ENV.APP_NAME).toBe("audit-logger");
			expect(ENV.SERVICE_NAME).toBe("audit");
			expect(ENV.INSTANCE_ID).toBe("instance-1");
			expect(ENV.ADDRESS_MANAGER_URL).toBe("https://address-manager:3000");
		});
	});

	it("should throw when required env var TLS_KEY_PATH is missing", () => {
		jest.isolateModules(() => {
			Object.assign(process.env, REQUIRED_ENV);
			delete process.env.TLS_KEY_PATH;

			expect(() => {
				require("../../../src/config/env");
			}).toThrow();
		});
	});
});
