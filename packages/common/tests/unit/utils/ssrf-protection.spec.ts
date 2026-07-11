import { describe, expect, it } from "@jest/globals";
import type { Hostname } from "../../../src/domain/primitives/hostname";
import {
	assertNotInternalAddress,
	isInternalAddress,
} from "../../../src/utils/ssrf-protection";

describe("isInternalAddress", () => {
	it("should return true for empty hostname", () => {
		expect(isInternalAddress("" as Hostname)).toBe(true);
	});

	it("should return false for localhost", () => {
		expect(isInternalAddress("localhost" as Hostname)).toBe(false);
	});

	it("should return true for loopback IPv4", () => {
		expect(isInternalAddress("127.0.0.1" as Hostname)).toBe(true);
	});

	it("should return true for private IPv4 10.x", () => {
		expect(isInternalAddress("10.0.0.1" as Hostname)).toBe(true);
	});

	it("should return true for link-local IPv4", () => {
		expect(isInternalAddress("169.254.1.1" as Hostname)).toBe(true);
	});

	it("should return true for private IPv4 192.168.x", () => {
		expect(isInternalAddress("192.168.1.1" as Hostname)).toBe(true);
	});

	it("should return false for public IPv4", () => {
		expect(isInternalAddress("8.8.8.8" as Hostname)).toBe(false);
	});

	it("should return true for IPv6 loopback", () => {
		expect(isInternalAddress("::1" as Hostname)).toBe(true);
	});

	it("should return true for IPv4-mapped IPv6 loopback", () => {
		expect(isInternalAddress("::ffff:127.0.0.1" as Hostname)).toBe(true);
	});

	it("should return true for unique local IPv6 addresses", () => {
		expect(isInternalAddress("fd00::1" as Hostname)).toBe(true);
		expect(isInternalAddress("fc00::1" as Hostname)).toBe(true);
	});

	it("should return true for link-local IPv6", () => {
		expect(isInternalAddress("fe80::1" as Hostname)).toBe(true);
	});

	it("should return true for 0.0.0.0", () => {
		expect(isInternalAddress("0.0.0.0" as Hostname)).toBe(true);
	});

	it("should return false for hostnames that are not IPs", () => {
		expect(isInternalAddress("example.com" as Hostname)).toBe(false);
	});
});

describe("assertNotInternalAddress", () => {
	it("should not throw for public addresses", () => {
		expect(() => assertNotInternalAddress("8.8.8.8" as Hostname)).not.toThrow();
	});

	it("should throw for internal addresses", () => {
		expect(() => assertNotInternalAddress("127.0.0.1" as Hostname)).toThrow(
			"SSRF blocked"
		);
	});
});
