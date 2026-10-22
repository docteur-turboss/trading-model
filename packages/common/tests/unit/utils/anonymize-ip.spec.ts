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

	it("zeroes IPv6 groups beyond the /64 prefix", () => {
		expect(anonymizeIp("2001:db8:85a3:0:0:8a2e:370:7334")).toBe(
			"2001:db8:85a3:0:0:0:0:0"
		);
	});

	it("keeps short IPv6 addresses unchanged", () => {
		expect(anonymizeIp("a:b:c:d:e")).toBe("a:b:c:d:e");
	});

	it("zeroes the last octet of a plain IPv4 address", () => {
		expect(anonymizeIp("192.168.1.42")).toBe("192.168.1.0");
	});

	it("returns input unchanged when there is no dot to truncate", () => {
		expect(anonymizeIp("no-dot")).toBe("no-dot");
	});
});
