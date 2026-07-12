import { describe, expect, it } from "@jest/globals";
import { ServiceStatus } from "@trading-model/validation/contracts/admin/services.dto";

describe("ServiceStatus", () => {
	it("should have correct enum values", () => {
		expect(ServiceStatus).toBeDefined();
	});
});
