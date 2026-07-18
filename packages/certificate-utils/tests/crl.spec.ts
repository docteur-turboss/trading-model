import { describe, expect, it } from "@jest/globals";
import {
	toSerialNumber,
	toServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { RevocationReason } from "../../common/src/domain/revocation-request";
import type { RevokedCertificate } from "../src/keygen/types";
import { createCrl } from "../src/validation/crl";

function makeRevokedEntry(
	overrides?: Partial<RevokedCertificate>
): RevokedCertificate {
	return {
		serialNumber: toSerialNumber("SN-001"),
		serviceId: toServiceId("svc-revoked"),
		revokedAt: UnixTimestamp.now(),
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

		expect(crl.lastUpdate).toBeGreaterThanOrEqual(before);
		expect(crl.lastUpdate).toBeLessThanOrEqual(after);
	});

	it("should use default TTL of 7 days", () => {
		const crl = createCrl([]);
		const expectedNextUpdate = crl.lastUpdate + 7 * 24 * 60 * 60 * 1000;

		expect(crl.nextUpdate).toBe(expectedNextUpdate);
	});

	it("should use custom TTL for nextUpdate", () => {
		const crl = createCrl([], 3600000 as never);
		const expectedNextUpdate = crl.lastUpdate + 3600000;

		expect(crl.nextUpdate).toBe(expectedNextUpdate);
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
