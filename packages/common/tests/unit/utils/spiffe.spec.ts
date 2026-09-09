import { describe, expect, it } from "@jest/globals";
import { ServiceId } from "../../../src/domain/primitives";
import {
	buildSpiffeId,
	extractCanonicalServiceName,
	extractServiceName,
} from "../../../src/utils/spiffe";

describe("extractServiceName", () => {
	it("should extract service name from SPIFFE identity", () => {
		expect(
			extractServiceName("spiffe://cluster.local/ns/default/sa/my-service")
		).toBe(ServiceId.of("my-service"));
	});

	it("should return api-gateway for client: prefix", () => {
		expect(extractServiceName("client:gateway")).toBe(
			ServiceId.of("api-gateway")
		);
	});

	it("should return plain string identity as-is", () => {
		expect(extractServiceName("direct-name")).toBe(ServiceId.of("direct-name"));
	});

	it("should return null for empty string", () => {
		expect(extractServiceName("")).toBeNull();
	});

	it("should handle platform SPIFFE IDs built by buildSpiffeId", () => {
		expect(extractServiceName(buildSpiffeId("message-manager"))).toBe(
			ServiceId.of("message-manager")
		);
	});
});

describe("extractCanonicalServiceName", () => {
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
