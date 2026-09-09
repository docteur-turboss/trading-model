import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { AddressManagerEnvSchema } from "@trading-model/validation/infrastructure/validation/address-manager-env";
import {
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/validation/infrastructure/validation/env";

describe("validateEnv", () => {
	const OldEnv = process.env;

	beforeEach(() => {
		jest.restoreAllMocks();
		process.env = { ...OldEnv };
		jest.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		process.env = OldEnv;
		jest.restoreAllMocks();
	});

	it("should return parsed env when valid", () => {
		process.env.NODE_ENV = "production";
		process.env.TLS_KEY_PATH = "/some/key";
		process.env.TLS_CERT_PATH = "/some/cert";
		process.env.TLS_CA_PATH = "/some/ca";

		const result = validateEnv(BaseEnvSchema);
		expect(result.NODE_ENV).toBe("production");
		expect(result.TLS_KEY_PATH).toBe("/some/key");
		expect(result.TLS_CERT_PATH).toBe("/some/cert");
		expect(result.TLS_CA_PATH).toBe("/some/ca");
	});

	it("should throw ConfigurationError on invalid env", () => {
		delete process.env.NODE_ENV;
		delete process.env.TLS_KEY_PATH;
		delete process.env.TLS_CERT_PATH;
		delete process.env.TLS_CA_PATH;

		expect(() => validateEnv(BaseEnvSchema)).toThrow(Error);
	});

	it("should apply default values", () => {
		delete process.env.NODE_ENV;
		process.env.TLS_KEY_PATH = "/key";
		process.env.TLS_CERT_PATH = "/cert";
		process.env.TLS_CA_PATH = "/ca";

		const result = validateEnv(BaseEnvSchema);
		expect(result.PORT).toBe(3000);
		expect(result.LOG_LEVEL).toBe("info");
		expect(result.NODE_ENV).toBe("development");
	});

	it("should coerce PORT to number", () => {
		process.env.NODE_ENV = "production";
		process.env.PORT = "4000";
		process.env.TLS_KEY_PATH = "/key";
		process.env.TLS_CERT_PATH = "/cert";
		process.env.TLS_CA_PATH = "/ca";

		const result = validateEnv(BaseEnvSchema);
		expect(result.PORT).toBe(4000);
	});

	it("should handle invalid env when treeifyError is unavailable", () => {
		jest.isolateModules(() => {
			jest.doMock("zod", () => {
				const actual: Record<string, unknown> = jest.requireActual("zod");
				delete actual.treeifyError;
				return actual;
			});

			const {
				validateEnv: validate2,
				BaseEnvSchema: BaseSchema2,
			} = require("@trading-model/validation/infrastructure/validation/env");

			delete process.env.NODE_ENV;
			delete process.env.TLS_KEY_PATH;
			delete process.env.TLS_CERT_PATH;
			delete process.env.TLS_CA_PATH;

			expect(() => validate2(BaseSchema2)).toThrow(
				"Environment validation failed"
			);
		});
	});

	it("should handle treeifyError throwing an exception", () => {
		const zod = jest.requireActual("zod") as any;
		jest.spyOn(zod.z, "treeifyError").mockImplementation(() => {
			throw new Error("treeify failed");
		});

		delete process.env.NODE_ENV;
		delete process.env.TLS_KEY_PATH;
		delete process.env.TLS_CERT_PATH;
		delete process.env.TLS_CA_PATH;

		expect(() => validateEnv(BaseEnvSchema)).toThrow(Error);
	});

	it("should handle invalid env when treeifyError is not a function", () => {
		const zod = jest.requireActual("zod") as any;
		const origTreeifyError = zod.z.treeifyError;
		delete zod.z.treeifyError;

		delete process.env.NODE_ENV;
		delete process.env.TLS_KEY_PATH;
		delete process.env.TLS_CERT_PATH;
		delete process.env.TLS_CA_PATH;

		expect(() => validateEnv(BaseEnvSchema)).toThrow(Error);

		zod.z.treeifyError = origTreeifyError;
	});
});

describe("AddressManagerEnvSchema — DNS_NAME_MAP", () => {
	const OldEnv = process.env;

	beforeEach(() => {
		jest.restoreAllMocks();
		process.env = { ...OldEnv };
	});

	afterEach(() => {
		process.env = OldEnv;
		jest.restoreAllMocks();
	});

	it("should default to empty object when DNS_NAME_MAP is not set", () => {
		delete process.env.DNS_NAME_MAP;
		process.env.APP_NAME = "test";
		process.env.SERVICE_NAME = "test";
		process.env.INSTANCE_ID = "test";
		process.env.ADDRESS_MANAGER_URL = "http://localhost";

		const result = validateEnv(AddressManagerEnvSchema);
		expect(result.DNS_NAME_MAP).toEqual({});
	});

	it("should parse valid JSON object from DNS_NAME_MAP", () => {
		process.env.DNS_NAME_MAP = '{"discovery-service":"discovery-server"}';
		process.env.APP_NAME = "test";
		process.env.SERVICE_NAME = "test";
		process.env.INSTANCE_ID = "test";
		process.env.ADDRESS_MANAGER_URL = "http://localhost";

		const result = validateEnv(AddressManagerEnvSchema);
		expect(result.DNS_NAME_MAP).toEqual({
			"discovery-service": "discovery-server",
		});
	});

	it("should fall back to empty object on invalid JSON", () => {
		process.env.DNS_NAME_MAP = "{invalid-json}";
		process.env.APP_NAME = "test";
		process.env.SERVICE_NAME = "test";
		process.env.INSTANCE_ID = "test";
		process.env.ADDRESS_MANAGER_URL = "http://localhost";

		const result = validateEnv(AddressManagerEnvSchema);
		expect(result.DNS_NAME_MAP).toEqual({});
	});

	it("should fall back to empty object when JSON is not an object", () => {
		process.env.DNS_NAME_MAP = '"just a string"';
		process.env.APP_NAME = "test";
		process.env.SERVICE_NAME = "test";
		process.env.INSTANCE_ID = "test";
		process.env.ADDRESS_MANAGER_URL = "http://localhost";

		const result = validateEnv(AddressManagerEnvSchema);
		expect(result.DNS_NAME_MAP).toEqual({});
	});

	it("should fall back to empty object when JSON is an array", () => {
		process.env.DNS_NAME_MAP = '["a","b"]';
		process.env.APP_NAME = "test";
		process.env.SERVICE_NAME = "test";
		process.env.INSTANCE_ID = "test";
		process.env.ADDRESS_MANAGER_URL = "http://localhost";

		const result = validateEnv(AddressManagerEnvSchema);
		expect(result.DNS_NAME_MAP).toEqual({});
	});
});
