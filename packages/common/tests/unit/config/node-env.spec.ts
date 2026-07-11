import { afterEach, describe, expect, it } from "@jest/globals";
import {
	getNodeEnv,
	isDevelopment,
	isProduction,
	isStaging,
} from "../../../src/config/node-env";

const ORIGINAL = process.env.NODE_ENV;

describe("node-env", () => {
	afterEach(() => {
		process.env.NODE_ENV = ORIGINAL;
	});

	it("should get node env", () => {
		process.env.NODE_ENV = "production";
		const env = getNodeEnv();
		expect(env).toBeDefined();
	});

	it("should detect production", () => {
		process.env.NODE_ENV = "production";
		expect(isProduction()).toBe(true);
		expect(isDevelopment()).toBe(false);
		expect(isStaging()).toBe(false);
	});

	it("should detect staging", () => {
		process.env.NODE_ENV = "staging";
		expect(isStaging()).toBe(true);
		expect(isProduction()).toBe(false);
	});

	it("should detect development", () => {
		process.env.NODE_ENV = "development";
		expect(isDevelopment()).toBe(true);
		expect(isProduction()).toBe(false);
	});
});
