import { describe, expect, it } from "@jest/globals";
import { HttpMethod } from "@trading-model/http/http-types";

describe("HttpMethod re-export", () => {
	it("should have GET", () => {
		expect(HttpMethod.Get).toBe("GET");
	});

	it("should have POST", () => {
		expect(HttpMethod.Post).toBe("POST");
	});

	it("should have PUT", () => {
		expect(HttpMethod.Put).toBe("PUT");
	});

	it("should have DELETE", () => {
		expect(HttpMethod.Delete).toBe("DELETE");
	});
});
