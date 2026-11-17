import { afterEach, describe, expect, it } from "@jest/globals";
import { getNodeEnv } from "@trading-model/http/shared/node-env";

const ORIGINAL = process.env.NODE_ENV;

describe("node-env", () => {
	afterEach(() => {
		process.env.NODE_ENV = ORIGINAL;
	});

	it("should get node env", () => {
		process.env.NODE_ENV = "production";
		expect(getNodeEnv()).toBe("production");
	});

	it("should default to development", () => {
		delete process.env.NODE_ENV;
		expect(getNodeEnv()).toBe("development");
	});
});
