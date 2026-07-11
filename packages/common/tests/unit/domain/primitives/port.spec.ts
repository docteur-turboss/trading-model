import { describe, expect, it } from "@jest/globals";
import { Port } from "../../../../src/domain/primitives/port";

describe("Port", () => {
	it("should create a valid port", () => {
		expect(Port.of(8080)).toBe(8080);
	});

	it("should allow port 0", () => {
		expect(Port.of(0)).toBe(0);
	});

	it("should allow port 65535", () => {
		expect(Port.of(65535)).toBe(65535);
	});

	it("should throw for negative port", () => {
		expect(() => Port.of(-1)).toThrow(RangeError);
	});

	it("should throw for port > 65535", () => {
		expect(() => Port.of(65536)).toThrow(RangeError);
	});

	it("should throw for non-integer", () => {
		expect(() => Port.of(80.5)).toThrow(RangeError);
	});
});
