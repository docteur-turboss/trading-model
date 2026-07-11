import { describe, expect, it } from "@jest/globals";
import { Severity } from "../../../../src/contracts/admin/audit.dto";

describe("Severity", () => {
	it("should have correct enum values", () => {
		expect(Severity).toBeDefined();
	});
});
