import { describe, expect, it } from "@jest/globals";
import { ServiceId } from "@trading-model/primitives/primitives";
import {
	DEFAULT_NAMESPACE,
	TRUST_DOMAIN,
} from "../../../src/config/workload-identity";
import { extractCanonicalServiceName } from "../../../src/utils/spiffe";

const buildSpiffeId = (name: string): string =>
	`spiffe://${TRUST_DOMAIN}/ns/${DEFAULT_NAMESPACE}/sa/${name}`;

describe("extractCanonicalServiceName", () => {
	it("should refuse another trust domain, path shape, namespace, CN or client: name", () => {
		for (const id of [
			"spiffe://other.domain/ns/autre/sa/api-gateway",
			"spiffe://trading-model.local/api-gateway",
			"spiffe://trading-model.local/ns/trading-model/sa/x/api-gateway",
			"direct-name",
			"discovery-service",
			"client:admin",
		]) {
			expect(extractCanonicalServiceName(id)).toBeNull();
		}
		expect(
			extractCanonicalServiceName(buildSpiffeId("api-gateway"), "autre")
		).toBeNull();
	});

	it("should find the SPIFFE ID in a peer certificate SAN list", () => {
		// Node reports subjectaltname as "DNS:<name>, URI:spiffe://...".
		expect(
			extractCanonicalServiceName(
				`DNS:financial-scraper, URI:${buildSpiffeId("financial-scraper")}`
			)
		).toBe(ServiceId.of("financial-scraper"));
		expect(
			extractCanonicalServiceName(`URI:${buildSpiffeId("trader-trainer")}`)
		).toBe(ServiceId.of("trader-trainer"));
	});

	it("should extract last segment from SPIFFE identities", () => {
		expect(extractCanonicalServiceName(buildSpiffeId("api-gateway"))).toBe(
			ServiceId.of("api-gateway")
		);
	});

	it("should return null for empty string", () => {
		expect(extractCanonicalServiceName("")).toBeNull();
	});
});
