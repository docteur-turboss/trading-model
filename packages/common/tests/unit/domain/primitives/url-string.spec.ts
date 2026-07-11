import { describe, expect, it } from "@jest/globals";
import { URLString } from "../../../../src/domain/primitives/url-string";

describe("URLString", () => {
	it("should create a valid URL", () => {
		expect(URLString.of("https://example.com")).toBe("https://example.com");
	});

	it("should throw for invalid URL", () => {
		expect(() => URLString.of("not-a-url")).toThrow(RangeError);
	});

	it("should convert to URL object", () => {
		const url = URLString.toURL("https://example.com/path" as never);
		expect(url).toBeInstanceOf(URL);
		expect(url.hostname).toBe("example.com");
	});

	it("should check if HTTPS", () => {
		expect(URLString.isHTTPS("https://example.com" as never)).toBe(true);
		expect(URLString.isHTTPS("http://example.com" as never)).toBe(false);
	});

	it("should extract origin", () => {
		expect(URLString.origin("https://example.com/path" as never)).toBe(
			"https://example.com"
		);
	});

	it("should extract pathname", () => {
		expect(URLString.pathname("https://example.com/api/v1" as never)).toBe(
			"/api/v1"
		);
	});

	it("should extract hostname", () => {
		expect(URLString.hostname("https://example.com:8080" as never)).toBe(
			"example.com"
		);
	});
});
