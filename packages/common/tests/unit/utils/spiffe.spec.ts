import { describe, expect, it } from "@jest/globals";
import { ServiceId } from "@trading-model/primitives/primitives";
import {
	buildSpiffeId,
	extractCanonicalServiceName,
	registryNamesFor,
} from "../../../src/utils/spiffe";

describe("extractCanonicalServiceName", () => {
	it("should extract service name from a foreign-trust-domain SPIFFE ID", () => {
		expect(
			extractCanonicalServiceName(
				"spiffe://cluster.local/ns/default/sa/my-service"
			)
		).toBe(ServiceId.of("my-service"));
	});

	it("should pass unknown plain identities through", () => {
		expect(extractCanonicalServiceName("direct-name")).toBe(
			ServiceId.of("direct-name")
		);
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
		expect(extractCanonicalServiceName(buildSpiffeId("dlq-service"))).toBe(
			ServiceId.of("dlq-service")
		);
	});

	it("should normalize legacy names onto canonical names", () => {
		expect(extractCanonicalServiceName("discovery-service")).toBe(
			ServiceId.of("discovery-server")
		);
	});

	it("should map client: prefix to api-gateway", () => {
		expect(extractCanonicalServiceName("client:admin")).toBe(
			ServiceId.of("api-gateway")
		);
	});

	it("should return null for empty string", () => {
		expect(extractCanonicalServiceName("")).toBeNull();
	});
});

describe("registryNamesFor", () => {
	it("lists the canonical name and its legacy registration aliases", () => {
		expect(registryNamesFor("financial-scraper")).toEqual([
			"financial-scraper",
			"financial-scraper-service",
		]);
	});

	it("maps a legacy name back to the same set", () => {
		expect(registryNamesFor("message-delivery-service")).toEqual([
			"message-delivery-service",
			"message-manager",
		]);
	});
});
