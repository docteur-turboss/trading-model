import { describe, expect, it } from "@jest/globals";
import { URLString } from "../../../src/primitives/url-string";

describe("URLString", () => {
	it("should create a valid URL", () => {
		expect(URLString.of("https://example.com")).toBe("https://example.com");
	});

	it("should throw for invalid URL", () => {
		expect(() => URLString.of("not-a-url")).toThrow(RangeError);
	});
});
