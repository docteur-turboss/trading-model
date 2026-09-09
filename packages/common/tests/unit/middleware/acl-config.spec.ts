import { describe, expect, it } from "@jest/globals";
import { DEFAULT_ACL, KnownService } from "../../../src/middleware/acl-config";

describe("DEFAULT_ACL", () => {
	it("should contain entries for all known services", () => {
		expect(DEFAULT_ACL[KnownService.DiscoveryServer]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.AuditLogger]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.MessageManager]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.FinancialScraper]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.TraderTrainer]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.ApiGateway]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.DlqService]).toBeDefined();
	});

	it("should have at least one ServiceId per service", () => {
		for (const entry of Object.values(DEFAULT_ACL)) {
			expect(entry.length).toBeGreaterThan(0);
		}
	});
});
