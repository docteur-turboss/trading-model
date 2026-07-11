import { describe, expect, it } from "@jest/globals";
import * as persistence from "../../../src/persistence/index";

describe("persistence/index", () => {
	it("should export ConnectionManager", () => {
		expect(persistence.ConnectionManager).toBeDefined();
	});

	it("should export DEFAULT_CONNECTION_OPTIONS", () => {
		expect(persistence.DEFAULT_CONNECTION_OPTIONS).toBeDefined();
	});

	it("should export createPoolOptions", () => {
		expect(typeof persistence.createPoolOptions).toBe("function");
	});

	it("should export resolvePoolSize", () => {
		expect(typeof persistence.resolvePoolSize).toBe("function");
	});
});
