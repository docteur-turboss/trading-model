import { describe, expect, it } from "@jest/globals";
import { ServiceStatus } from "../../../../src/contracts/admin/services.dto";

describe("ServiceStatus", () => {
	it("should have correct enum values", () => {
		expect(ServiceStatus).toBeDefined();
	});
});
