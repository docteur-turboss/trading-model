import { describe, expect, it } from "@jest/globals";
import { DEFAULT_ACL } from "../../../src/middleware/acl-config";

describe("DEFAULT_ACL", () => {
	it("should contain entries for all known services", () => {
		expect(DEFAULT_ACL["certificate-authority"]).toBeDefined();
		expect(DEFAULT_ACL["discovery-server"]).toBeDefined();
		expect(DEFAULT_ACL["audit-logger"]).toBeDefined();
		expect(DEFAULT_ACL["message-manager"]).toBeDefined();
		expect(DEFAULT_ACL["financial-scraper"]).toBeDefined();
		expect(DEFAULT_ACL["trader-trainer"]).toBeDefined();
		expect(DEFAULT_ACL["api-gateway"]).toBeDefined();
	});

	it("should have at least one ServiceId per service", () => {
		for (const entry of Object.values(DEFAULT_ACL)) {
			expect(entry.length).toBeGreaterThan(0);
		}
	});
});
