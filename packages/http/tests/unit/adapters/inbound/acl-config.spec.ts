import { describe, expect, it } from "@jest/globals";
import { DEFAULT_ACL } from "@trading-model/http/acl-config";
import { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";

describe("DEFAULT_ACL", () => {
	it("should contain entries for all known services", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.DiscoveryService]).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.AuditLoggerService]).toBeDefined();
		expect(
			DEFAULT_ACL[ServiceInstanceName.FinancialScraperService]
		).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.TraderTrainerService]).toBeDefined();
		expect(DEFAULT_ACL[ServiceInstanceName.ApiGatewayService]).toBeDefined();
	});

	it("should let the model evaluator read the trainer models", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.TraderTrainerService]).toContain(
			"model-evaluator"
		);
	});

	it("should let only the decision consumer (and the operator) send intents to risk-execution", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.RiskExecutionService]).toEqual([
			"risk-execution",
			"decision-consumer",
		]);
		for (const target of [
			ServiceInstanceName.TraderTrainerService,
			ServiceInstanceName.FinancialScraperService,
		]) {
			expect(DEFAULT_ACL[target]).toContain("decision-consumer");
		}
	});

	it("should let the trainer read the data supply", () => {
		// Its inputs change in the trainer only (ADR-0036).
		expect(DEFAULT_ACL[ServiceInstanceName.FinancialScraperService]).toContain(
			"trader-trainer"
		);
	});

	it("should refuse other workloads on audit-logger", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.AuditLoggerService]).toEqual([
			"api-gateway",
		]);
	});

	it("should only let the edge proxy reach the gateway", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.ApiGatewayService]).toEqual([
			"edge-proxy",
		]);
	});

	it("should have at least one ServiceId per service but model-evaluator, which nobody calls", () => {
		expect(DEFAULT_ACL[ServiceInstanceName.ModelEvaluatorService]).toEqual([]);
		for (const [service, entry] of Object.entries(DEFAULT_ACL)) {
			if (service !== ServiceInstanceName.ModelEvaluatorService) {
				expect(entry.length).toBeGreaterThan(0);
			}
		}
	});
});
