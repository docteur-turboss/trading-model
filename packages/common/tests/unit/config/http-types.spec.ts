import { describe, expect, it } from "@jest/globals";
import { HttpHeaderValue, HttpMethod } from "../../../src/config/http-types";

describe("HttpHeaderValue", () => {
	it("should create from a valid string", () => {
		const hv = HttpHeaderValue.of("application/json");
		expect(hv).toBe("application/json");
	});

	it("should throw RangeError for non-string input", () => {
		expect(() => HttpHeaderValue.of(42 as unknown as string)).toThrow(
			RangeError
		);
		expect(() => HttpHeaderValue.of(42 as unknown as string)).toThrow(
			"HttpHeaderValue must be a string"
		);
	});

	it("should create from an empty string", () => {
		const hv = HttpHeaderValue.of("");
		expect(hv).toBe("");
	});
});

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
