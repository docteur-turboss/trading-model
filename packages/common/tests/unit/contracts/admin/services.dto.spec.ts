import { describe, expect, it } from "@jest/globals";
import { ServiceStatus } from "@trading-model/validation/adapters/inbound/admin/services.dto";

describe("ServiceStatus", () => {
	it("should have correct enum values", () => {
		expect(ServiceStatus).toBeDefined();
	});
});
