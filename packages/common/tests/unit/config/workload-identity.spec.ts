import { describe, expect, it } from "@jest/globals";
import {
	buildSpiffeId,
	DEFAULT_NAMESPACE,
	isPlatformService,
	isSpiffeId,
	normalizeServiceName,
	parseSpiffeId,
	SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT,
	serviceNameFromSpiffeId,
	TRUST_DOMAIN,
} from "../../../src/config/workload-identity";
import { ServiceId } from "../../../src/domain/primitives/general-ids";

describe("workload-identity", () => {
	describe("buildSpiffeId", () => {
		it("should build a platform SPIFFE ID with the default namespace", () => {
			expect(buildSpiffeId("message-manager")).toBe(
				`spiffe://${TRUST_DOMAIN}/ns/${DEFAULT_NAMESPACE}/sa/message-manager`
			);
		});

		it("should accept an explicit namespace", () => {
			expect(buildSpiffeId("api-gateway", "default")).toBe(
				`spiffe://${TRUST_DOMAIN}/ns/default/sa/api-gateway`
			);
		});

		it("should normalize legacy aliases onto canonical names", () => {
			expect(buildSpiffeId("discovery-service")).toBe(
				`spiffe://${TRUST_DOMAIN}/ns/${DEFAULT_NAMESPACE}/sa/discovery-server`
			);
		});
	});

	describe("isSpiffeId", () => {
		it("should accept valid SPIFFE IDs", () => {
			expect(isSpiffeId(buildSpiffeId("dlq-service"))).toBe(true);
		});

		it("should reject non-SPIFFE identities", () => {
			expect(isSpiffeId("client:gateway")).toBe(false);
			expect(isSpiffeId("direct-name")).toBe(false);
			expect(isSpiffeId("spiffe://")).toBe(false);
			expect(isSpiffeId("")).toBe(false);
		});
	});

	describe("parseSpiffeId", () => {
		it("should parse the platform scheme into components", () => {
			const parsed = parseSpiffeId(
				"spiffe://trading-model.local/ns/prod/sa/trader-trainer"
			);
			expect(parsed).toMatchObject({
				trustDomain: "trading-model.local",
				namespace: "prod",
				serviceAccount: "trader-trainer",
				serviceName: ServiceId.of("trader-trainer"),
			});
		});

		it("should tolerate unknown path shapes and keep the last segment", () => {
			const parsed = parseSpiffeId("spiffe://example.org/team/eng/svc");
			expect(parsed).not.toBeNull();
			expect(parsed?.trustDomain).toBe("example.org");
			expect(parsed?.namespace).toBeUndefined();
			expect(parsed?.serviceName).toBe(ServiceId.of("svc"));
		});

		it("should return null for malformed identities", () => {
			expect(parseSpiffeId("https://example.org/svc")).toBeNull();
			expect(parseSpiffeId("spiffe://")).toBeNull();
			expect(parseSpiffeId("")).toBeNull();
		});
	});

	describe("serviceNameFromSpiffeId", () => {
		it("should extract the canonical last path segment", () => {
			expect(serviceNameFromSpiffeId(buildSpiffeId("financial-scraper"))).toBe(
				ServiceId.of("financial-scraper")
			);
		});
	});

	describe("normalizeServiceName", () => {
		it("should map legacy discovery-registry names onto canonical names", () => {
			expect(normalizeServiceName("message-delivery-service")).toBe(
				ServiceId.of("message-manager")
			);
			expect(normalizeServiceName("audit-logger-service")).toBe(
				ServiceId.of("audit-logger")
			);
			expect(normalizeServiceName("financial-scrapper-service")).toBe(
				ServiceId.of("financial-scraper")
			);
		});

		it("should pass through canonical and unknown names", () => {
			expect(normalizeServiceName("api-gateway")).toBe(
				ServiceId.of("api-gateway")
			);
			expect(normalizeServiceName("some-future-service")).toBe(
				ServiceId.of("some-future-service")
			);
		});
	});

	describe("isPlatformService", () => {
		it("should recognise platform services", () => {
			expect(isPlatformService("message-manager")).toBe(true);
			expect(isPlatformService(SPIFFE_PATH_SEGMENT_SERVICE_ACCOUNT)).toBe(
				false
			);
		});
	});
});
