import { describe, expect, it } from "@jest/globals";
import {
	toSerialNumber,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { RevocationReason } from "../../common/src/domain/revocation-request";
import { createCrl, isRevoked } from "../src/crl";
import type { RevokedCertificate } from "../src/types";

function makeRevokedEntry(
	overrides?: Partial<RevokedCertificate>
): RevokedCertificate {
	return {
		serialNumber: toSerialNumber("SN-001"),
		serviceId: toServiceId("svc-revoked"),
		revokedAt: new Date(),
		reason: RevocationReason.KeyCompromise,
		...overrides,
	};
}

describe("createCrl", () => {
	it("should return CRL with provided entries", () => {
		const entries = [makeRevokedEntry()];

		const crl = createCrl(entries);

		expect(crl.entries).toHaveLength(1);
		expect(crl.entries[0].serialNumber).toBe(toSerialNumber("SN-001"));
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
		const crl = createCrl([], 3600000 as never);
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
				serialNumber: toSerialNumber("SN-001"),
				serviceId: toServiceId("svc-1"),
				reason: RevocationReason.KeyCompromise,
			}),
			makeRevokedEntry({
				serialNumber: toSerialNumber("SN-002"),
				serviceId: toServiceId("svc-2"),
				reason: RevocationReason.CessationOfOperation,
			}),
			makeRevokedEntry({
				serialNumber: toSerialNumber("SN-003"),
				serviceId: toServiceId("svc-3"),
				reason: RevocationReason.Superseded,
			}),
		];

		const crl = createCrl(entries);

		expect(crl.entries).toHaveLength(3);
	});
});

describe("isRevoked", () => {
	it("should return true for a revoked serial number", () => {
		const crl = createCrl([
			makeRevokedEntry({ serialNumber: toSerialNumber("SN-001") }),
		]);

		expect(isRevoked(toSerialNumber("SN-001"), crl)).toBe(true);
	});

	it("should return false for a non-revoked serial number", () => {
		const crl = createCrl([
			makeRevokedEntry({ serialNumber: toSerialNumber("SN-001") }),
		]);

		expect(isRevoked(toSerialNumber("SN-999"), crl)).toBe(false);
	});

	it("should return false for an empty CRL", () => {
		const crl = createCrl([]);

		expect(isRevoked(toSerialNumber("SN-001"), crl)).toBe(false);
	});

	it("should return true when multiple entries exist", () => {
		const crl = createCrl([
			makeRevokedEntry({ serialNumber: toSerialNumber("SN-001") }),
			makeRevokedEntry({ serialNumber: toSerialNumber("SN-002") }),
			makeRevokedEntry({ serialNumber: toSerialNumber("SN-003") }),
		]);

		expect(isRevoked(toSerialNumber("SN-002"), crl)).toBe(true);
	});

	it("should return false for an expired revocation entry", () => {
		const moreThanAYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
		const crl = createCrl([
			makeRevokedEntry({
				serialNumber: toSerialNumber("SN-EXPIRED"),
				revokedAt: moreThanAYearAgo,
			}),
		]);

		expect(isRevoked(toSerialNumber("SN-EXPIRED"), crl)).toBe(false);
	});

	it("should return true for a recent revocation entry", () => {
		const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const crl = createCrl([
			makeRevokedEntry({
				serialNumber: toSerialNumber("SN-RECENT"),
				revokedAt: recent,
			}),
		]);

		expect(isRevoked(toSerialNumber("SN-RECENT"), crl)).toBe(true);
	});

	it("should return false for a revocation exactly at the expiry boundary", () => {
		const exactlyOneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
		const crl = createCrl([
			makeRevokedEntry({
				serialNumber: toSerialNumber("SN-BOUNDARY"),
				revokedAt: exactlyOneYearAgo,
			}),
		]);

		expect(isRevoked(toSerialNumber("SN-BOUNDARY"), crl)).toBe(true);
	});
});
