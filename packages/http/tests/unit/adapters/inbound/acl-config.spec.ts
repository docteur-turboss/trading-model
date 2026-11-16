import { describe, expect, it } from "@jest/globals";
import { DEFAULT_ACL, KnownService } from "@trading-model/http/acl-config";

describe("DEFAULT_ACL", () => {
	it("should contain entries for all known services", () => {
		expect(DEFAULT_ACL[KnownService.DiscoveryServer]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.AuditLogger]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.FinancialScraper]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.TraderTrainer]).toBeDefined();
		expect(DEFAULT_ACL[KnownService.ApiGateway]).toBeDefined();
	});

	it("should let the model evaluator read the trainer models", () => {
		expect(DEFAULT_ACL[KnownService.TraderTrainer]).toContain(
			"model-evaluator"
		);
	});

	it("should let the trainer read the data supply", () => {
		// Its inputs change in the trainer only (ADR-0036).
		expect(DEFAULT_ACL[KnownService.FinancialScraper]).toContain(
			"trader-trainer"
		);
	});

	it("should only let the edge proxy reach the gateway", () => {
		expect(DEFAULT_ACL[KnownService.ApiGateway]).toEqual(["edge-proxy"]);
	});

	it("should have at least one ServiceId per service", () => {
		for (const entry of Object.values(DEFAULT_ACL)) {
			expect(entry.length).toBeGreaterThan(0);
		}
	});
});
