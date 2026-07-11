import { describe, expect, it } from "@jest/globals";
import { IPAddress } from "../../../../src/domain/primitives/ip-address";

describe("IPAddress", () => {
	it("should create a valid IPv4 address", () => {
		expect(IPAddress.of("192.168.1.1")).toBe("192.168.1.1");
	});

	it("should create a valid IPv6 address", () => {
		expect(IPAddress.of("::1")).toBe("::1");
		expect(IPAddress.of("2001:db8::1")).toBe("2001:db8::1");
	});

	it("should allow empty string", () => {
		expect(IPAddress.of("")).toBe("");
	});

	it("should throw for invalid IP", () => {
		expect(() => IPAddress.of("not-an-ip")).toThrow(RangeError);
	});
});
