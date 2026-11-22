import { describe, expect, it } from "@jest/globals";
import { DEFAULT_ACL } from "@trading-model/http/acl-config";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";

describe("DEFAULT_ACL", () => {
	it("should contain entries for all known services", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.DiscoveryService]).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.AuditLoggerService]).toBeDefined();
		expect(
			DEFAULT_ACL[ServiceInstanceName.MessageManagerService]
		).toBeDefined();
		expect(
			DEFAULT_ACL[ServiceInstanceName.FinancialScraperService]
		).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.TraderTrainerService]).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.ApiGatewayService]).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.DlqService]).toBeDefined();
	});

	it("should not let message-manager call the scraper or trainer (no subscription)", () => {
		for (const target of [
			ServiceInstanceName.FinancialScraperService,
			ServiceInstanceName.TraderTrainerService,
		]) {
			expect(DEFAULT_ACL[target]).not.toContain("message-manager");
		}
	});

	it("should let the message-manager clients reach it", () => {
		// audit-logger subscribes to the audited topics; dlq-service republishes replays.
		for (const client of ["audit-logger", "dlq-service", "model-evaluator"]) {
			expect(DEFAULT_ACL[ServiceInstanceName.MessageManagerService]).toContain(
				client
			);
		}
	});

	it("should let the model evaluator read the trainer models, and only message-manager call it", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.TraderTrainerService]).toContain(
			"model-evaluator"
		);
		expect(DEFAULT_ACL[ServiceInstanceName.ModelEvaluatorService]).toEqual([
			"message-manager",
		]);
	});

	it("should let the trainer read the data supply", () => {
		// Its inputs change in the trainer only (ADR-0036).
		expect(DEFAULT_ACL[ServiceInstanceName.FinancialScraperService]).toContain(
			"trader-trainer"
		);
	});

	it("should not let the gateway publish or subscribe on clients' behalf", () => {
		expect(
			DEFAULT_ACL[ServiceInstanceName.MessageManagerService]
		).not.toContain("api-gateway");
	});

	it("should refuse other workloads on audit-logger and dlq-service", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.AuditLoggerService]).toEqual([
			"message-manager",
			"api-gateway",
		]);
		expect(DEFAULT_ACL[ServiceInstanceName.DlqService]).toEqual([
			"api-gateway",
		]);
	});

	it("should only let the edge proxy reach the gateway", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.ApiGatewayService]).toEqual([
			"edge-proxy",
		]);
	});

	it("should have at least one ServiceId per service", () => {
		for (const entry of Object.values(DEFAULT_ACL)) {
			expect(entry.length).toBeGreaterThan(0);
		}
	});
});
