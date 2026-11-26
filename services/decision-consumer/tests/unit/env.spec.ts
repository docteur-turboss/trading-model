import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const ORIGINAL = { ...process.env };
const REQUIRED = {
	TLS_KEY_PATH: "k",
	TLS_CERT_PATH: "c",
	TLS_CA_PATH: "a",
	APP_NAME: "decision-consumer",
	SERVICE_NAME: "decision-consumer",
	INSTANCE_ID: "i",
};

const loadEnv = () => {
	jest.resetModules();
	return require("../../src/infrastructure/config/env").ENV;
};

describe("DECISION_SKIP_ADMISSION (ADR-0092)", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL };
	});

	beforeEach(() => {
		Object.assign(process.env, REQUIRED);
	});

	it("is refused when NODE_ENV=production", () => {
		process.env.DECISION_SKIP_ADMISSION = "true";
		process.env.NODE_ENV = "production";
		expect(loadEnv).toThrow(/Environment validation failed/);
	});

	it("is accepted outside production", () => {
		process.env.DECISION_SKIP_ADMISSION = "true";
		process.env.NODE_ENV = "development";
		expect(loadEnv().DECISION_SKIP_ADMISSION).toBe(true);
	});
});
