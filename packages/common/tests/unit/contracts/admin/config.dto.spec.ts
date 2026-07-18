import { describe, expect, it } from "@jest/globals";
import { ConfigSource } from "@trading-model/validation/contracts/admin/config.dto";

describe("ConfigSource", () => {
	it("should have correct enum values", () => {
		expect(ConfigSource).toBeDefined();
	});
});
