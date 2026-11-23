import { describe, expect, it } from "@jest/globals";
import { anonymizeIp } from "../../../src/utils/anonymize-ip";

describe("anonymizeIp", () => {
	it("returns undefined for empty input", () => {
		expect(anonymizeIp(undefined)).toBeUndefined();
		expect(anonymizeIp(null)).toBeUndefined();
		expect(anonymizeIp("")).toBeUndefined();
	});

	it("strips the IPv4-mapped prefix and zeroes the last octet", () => {
		expect(anonymizeIp("::ffff:203.0.113.7")).toBe("203.0.113.0");
	});

	it.each([
		["2001:db8:85a3:0:0:8a2e:370:7334", "2001:db8:85a3::"],
		["2a01:e0a:1:2:3:4:5:6", "2a01:e0a:1::"],
		["2001:db8::1", "2001:db8:0::"],
		["fe80::1234:5678", "fe80:0:0::"],
		["::1", "0:0:0::"],
	])("truncates IPv6 %s to its /48", (input, expected) => {
		expect(anonymizeIp(input)).toBe(expected);
	});

	it("zeroes the last octet of a plain IPv4 address", () => {
		expect(anonymizeIp("192.168.1.42")).toBe("192.168.1.0");
	});

	it("returns input unchanged when there is no dot to truncate", () => {
		expect(anonymizeIp("no-dot")).toBe("no-dot");
	});
});
