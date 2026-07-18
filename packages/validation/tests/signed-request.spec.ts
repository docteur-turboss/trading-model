import { HttpMethod } from "../src/contracts/signed-request";

describe("HttpMethod", () => {
	it("has expected values", () => {
		expect(HttpMethod.Get).toBe("GET");
		expect(HttpMethod.Post).toBe("POST");
		expect(HttpMethod.Put).toBe("PUT");
		expect(HttpMethod.Patch).toBe("PATCH");
		expect(HttpMethod.Delete).toBe("DELETE");
		expect(HttpMethod.Head).toBe("HEAD");
		expect(HttpMethod.Options).toBe("OPTIONS");
	});
});
