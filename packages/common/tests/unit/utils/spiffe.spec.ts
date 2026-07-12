import { describe, expect, it } from "@jest/globals";
import { ServiceId } from "../../../src/domain/primitives";
import { extractServiceName } from "../../../src/utils/spiffe";

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
});
