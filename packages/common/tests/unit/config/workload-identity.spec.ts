import { describe, expect, it } from "@jest/globals";
import { ServiceId } from "@trading-model/primitives/primitives/general-ids";
import {
	DEFAULT_NAMESPACE,
	isSpiffeId,
	normalizeServiceName,
	parseSpiffeId,
	serviceNameFromSpiffeId,
	TRUST_DOMAIN,
} from "../../../src/config/workload-identity";

const buildSpiffeId = (name: string): string =>
	`spiffe://${TRUST_DOMAIN}/ns/${DEFAULT_NAMESPACE}/sa/${name}`;

describe("workload-identity", () => {
	describe("isSpiffeId", () => {
		it("should accept valid SPIFFE IDs", () => {
			expect(isSpiffeId(buildSpiffeId("audit-logger"))).toBe(true);
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
		it("should pass through canonical and unknown names", () => {
			expect(normalizeServiceName("api-gateway")).toBe(
				ServiceId.of("api-gateway")
			);
			expect(normalizeServiceName("some-future-service")).toBe(
				ServiceId.of("some-future-service")
			);
		});
	});
});
