import { describe, expect, it } from "@jest/globals";
import { Severity } from "@trading-model/validation/adapters/inbound/admin/audit.dto";

describe("Severity", () => {
	it("should have correct enum values", () => {
		expect(Severity).toBeDefined();
	});
});
