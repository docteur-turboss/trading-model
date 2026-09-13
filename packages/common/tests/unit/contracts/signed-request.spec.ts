import { describe, expect, it } from "@jest/globals";
import { HttpMethod } from "../../../src/contracts/signed-request";

describe("HttpMethod", () => {
	it("should have correct values", () => {
		expect(HttpMethod.Get).toBe("GET");
		expect(HttpMethod.Post).toBe("POST");
		expect(HttpMethod.Put).toBe("PUT");
		expect(HttpMethod.Patch).toBe("PATCH");
		expect(HttpMethod.Delete).toBe("DELETE");
		expect(HttpMethod.Head).toBe("HEAD");
		expect(HttpMethod.Options).toBe("OPTIONS");
	});

	it("should list all methods", () => {
		expect(Object.values(HttpMethod)).toHaveLength(7);
	});
});
