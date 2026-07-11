import { describe, expect, it } from "@jest/globals";
import { extractServiceName } from "../../../src/utils/spiffe";

describe("extractServiceName", () => {
	it("should extract name from SPIFFE URI", () => {
		expect(
			extractServiceName("spiffe://cluster.local/ns/default/sa/my-service")
		).toBe("my-service");
	});

	it("should return api-gateway for client: prefix", () => {
		expect(extractServiceName("client:gateway")).toBe("api-gateway");
	});

	it("should return plain string identity as-is", () => {
		expect(extractServiceName("direct-name")).toBe("direct-name");
	});

	it("should return null for empty string", () => {
		expect(extractServiceName("")).toBeNull();
	});
});
