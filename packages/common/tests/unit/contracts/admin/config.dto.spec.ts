import { describe, expect, it } from "@jest/globals";
import {
	ConfigKey,
	ConfigSource,
	ConfigValue,
} from "../../../../src/contracts/admin/config.dto";

describe("ConfigSource", () => {
	it("should have correct enum values", () => {
		expect(ConfigSource).toBeDefined();
	});
});

describe("ConfigKey", () => {
	it("should create with valid value", () => {
		const key = ConfigKey.of("test-key");
		expect(key).toBe("test-key");
	});
});

describe("ConfigValue", () => {
	it("should create with valid value", () => {
		const val = ConfigValue.of("test-value");
		expect(val).toBe("test-value");
	});
});
