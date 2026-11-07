import { describe, expect, it } from "@jest/globals";
import {
	DEFAULT_PRIVATE_CIDRS,
	isAllowedProxyIP,
	parseCIDRList,
} from "../../../src/primitives/ip-allowlist";

describe("parseCIDRList", () => {
	it("parses valid ranges and skips blanks and invalid entries", () => {
		const ranges = parseCIDRList(
			" 10.0.0.0/8, ,bad,1.2.3.4/33,1.2.3/24,1.2.3.256/24,5.6.7.8"
		);
		expect(ranges).toEqual([
			{ start: 0x0a000000, end: 0x0affffff, mask: 0xff000000 },
		]);
	});

	it("handles /0 and /32", () => {
		expect(parseCIDRList("0.0.0.0/0")).toEqual([
			{ start: 0, end: 0xffffffff, mask: 0 },
		]);
		expect(parseCIDRList("1.2.3.4/32")[0]).toMatchObject({
			start: 0x01020304,
			end: 0x01020304,
		});
	});
});

describe("isAllowedProxyIP", () => {
	const ranges = parseCIDRList(DEFAULT_PRIVATE_CIDRS);

	it("accepts addresses inside a range, bounds included", () => {
		expect(isAllowedProxyIP("10.1.2.3", ranges)).toBe(true);
		expect(isAllowedProxyIP("172.31.255.255", ranges)).toBe(true);
		expect(isAllowedProxyIP("127.0.0.1", ranges)).toBe(true);
	});

	it("rejects addresses outside every range", () => {
		expect(isAllowedProxyIP("172.32.0.0", ranges)).toBe(false);
		expect(isAllowedProxyIP("8.8.8.8", ranges)).toBe(false);
	});

	it("rejects malformed addresses", () => {
		expect(isAllowedProxyIP("::1", ranges)).toBe(false);
		expect(isAllowedProxyIP("10.0.0", ranges)).toBe(false);
		expect(isAllowedProxyIP("10.0.0.x", ranges)).toBe(false);
		expect(isAllowedProxyIP("10.0.0.300", ranges)).toBe(false);
	});
});
