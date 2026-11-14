import { describe, expect, it } from "@jest/globals";
import {
	DEFAULT_ACL,
	KnownService,
} from "@trading-model/http/adapters/inbound/acl-config";

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

	it("should let message-manager deliver to every message subscriber", () => {
		for (const subscriber of [
			KnownService.FinancialScraper,
			KnownService.TraderTrainer,
		]) {
			expect(DEFAULT_ACL[subscriber]).toContain("message-manager");
		}
	});

	it("should let the message-manager clients reach it", () => {
		// audit-logger subscribes to the audited topics; dlq-service republishes replays.
		for (const client of ["audit-logger", "dlq-service"]) {
			expect(DEFAULT_ACL[KnownService.MessageManager]).toContain(client);
		}
	});

	it("should let the trainer read the data supply", () => {
		// Its inputs change in the trainer only (ADR-0036).
		expect(DEFAULT_ACL[KnownService.FinancialScraper]).toContain(
			"trader-trainer"
		);
	});

	it("should not let the gateway publish or subscribe on clients' behalf", () => {
		expect(DEFAULT_ACL[KnownService.MessageManager]).not.toContain(
			"api-gateway"
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
