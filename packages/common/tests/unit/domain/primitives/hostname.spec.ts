import { describe, expect, it } from "@jest/globals";
import { Hostname } from "../../../../src/domain/primitives/hostname";

describe("Hostname", () => {
	it("should create a valid hostname", () => {
		expect(Hostname.of("example.com")).toBe("example.com");
	});

	it("should create a valid single-label hostname", () => {
		expect(Hostname.of("localhost")).toBe("localhost");
	});

	it("should throw for empty string", () => {
		expect(() => Hostname.of("")).toThrow(RangeError);
	});

	it("should throw for invalid characters", () => {
		expect(() => Hostname.of("invalid host!")).toThrow(RangeError);
	});

	it("should throw for too-long hostname", () => {
		const long = "a".repeat(254);
		expect(() => Hostname.of(long)).toThrow(RangeError);
	});
});
