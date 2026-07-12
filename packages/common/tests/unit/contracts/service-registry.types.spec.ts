import { describe, expect, it } from "@jest/globals";
import { Protocol } from "@trading-model/validation/contracts/service-registry.types";

describe("Protocol", () => {
	it("should have expected values", () => {
		expect(Protocol).toBeDefined();
	});
});
