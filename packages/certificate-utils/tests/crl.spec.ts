import { describe, expect, it } from "@jest/globals";
import { createCrl, isRevoked } from "../src/crl";
import type { RevokedCertificate } from "../src/types";

function makeRevokedEntry(
	overrides?: Partial<RevokedCertificate>
): RevokedCertificate {
	return {
		serialNumber: "SN-001",
		serviceId: "svc-revoked",
		revokedAt: new Date(),
		reason: "key_compromise",
		...overrides,
	};
}

describe("createCrl", () => {
	it("should return CRL with provided entries", () => {
		const entries = [makeRevokedEntry()];

		const crl = createCrl(entries);

		expect(crl.entries).toHaveLength(1);
		expect(crl.entries[0].serialNumber).toBe("SN-001");
	});

	it("should set lastUpdate to current time", () => {
		const before = Date.now();
		const crl = createCrl([]);
		const after = Date.now();

		expect(crl.lastUpdate.getTime()).toBeGreaterThanOrEqual(before);
		expect(crl.lastUpdate.getTime()).toBeLessThanOrEqual(after);
	});

	it("should use default TTL of 7 days", () => {
		const crl = createCrl([]);
		const expectedNextUpdate =
			crl.lastUpdate.getTime() + 7 * 24 * 60 * 60 * 1000;

		expect(crl.nextUpdate.getTime()).toBe(expectedNextUpdate);
	});

	it("should use custom TTL for nextUpdate", () => {
		const crl = createCrl([], 3600000);
		const expectedNextUpdate = crl.lastUpdate.getTime() + 3600000;

		expect(crl.nextUpdate.getTime()).toBe(expectedNextUpdate);
	});

	it("should return empty entries array when none provided", () => {
		const crl = createCrl([]);

		expect(crl.entries).toEqual([]);
	});

	it("should include all provided revoked entries", () => {
		const entries = [
			makeRevokedEntry({
				serialNumber: "SN-001",
				serviceId: "svc-1",
				reason: "key_compromise",
			}),
			makeRevokedEntry({
				serialNumber: "SN-002",
				serviceId: "svc-2",
				reason: "cessation_of_operation",
			}),
			makeRevokedEntry({
				serialNumber: "SN-003",
				serviceId: "svc-3",
				reason: "superseded",
			}),
		];

		const crl = createCrl(entries);

		expect(crl.entries).toHaveLength(3);
	});
});

describe("isRevoked", () => {
	it("should return true for a revoked serial number", () => {
		const crl = createCrl([makeRevokedEntry({ serialNumber: "SN-001" })]);

		expect(isRevoked("SN-001", crl)).toBe(true);
	});

	it("should return false for a non-revoked serial number", () => {
		const crl = createCrl([makeRevokedEntry({ serialNumber: "SN-001" })]);

		expect(isRevoked("SN-999", crl)).toBe(false);
	});

	it("should return false for an empty CRL", () => {
		const crl = createCrl([]);

		expect(isRevoked("SN-001", crl)).toBe(false);
	});

	it("should return true when multiple entries exist", () => {
		const crl = createCrl([
			makeRevokedEntry({ serialNumber: "SN-001" }),
			makeRevokedEntry({ serialNumber: "SN-002" }),
			makeRevokedEntry({ serialNumber: "SN-003" }),
		]);

		expect(isRevoked("SN-002", crl)).toBe(true);
	});

	it("should return false for an expired revocation entry", () => {
		const moreThanAYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
		const crl = createCrl([
			makeRevokedEntry({
				serialNumber: "SN-EXPIRED",
				revokedAt: moreThanAYearAgo,
			}),
		]);

		expect(isRevoked("SN-EXPIRED", crl)).toBe(false);
	});

	it("should return true for a recent revocation entry", () => {
		const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const crl = createCrl([
			makeRevokedEntry({ serialNumber: "SN-RECENT", revokedAt: recent }),
		]);

		expect(isRevoked("SN-RECENT", crl)).toBe(true);
	});

	it("should return false for a revocation exactly at the expiry boundary", () => {
		const exactlyOneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
		const crl = createCrl([
			makeRevokedEntry({
				serialNumber: "SN-BOUNDARY",
				revokedAt: exactlyOneYearAgo,
			}),
		]);

		expect(isRevoked("SN-BOUNDARY", crl)).toBe(true);
	});
});
