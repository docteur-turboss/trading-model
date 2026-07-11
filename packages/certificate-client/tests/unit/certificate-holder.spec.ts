import { describe, expect, it, jest } from "@jest/globals";
import type { CertRenewScheduler } from "../../src/cert-renew-scheduler";
import type { ObtainedCertificate } from "../../src/certificate-client";
import { CertificateHolder } from "../../src/certificate-holder";

describe("CertificateHolder", () => {
	const mockCert = {
		certPem: "cert" as any,
		keyPem: "key",
		caPem: "ca" as any,
		serialNumber: "SN" as any,
		expiresAt: new Date("2027-01-01") as any,
	} as ObtainedCertificate;

	function createMockScheduler(): jest.Mocked<CertRenewScheduler> {
		return {
			scheduleRenew: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined as any),
			start: jest.fn(),
			stop: jest.fn(),
		} as unknown as jest.Mocked<CertRenewScheduler>;
	}

	it("should return the current certificate", () => {
		const scheduler = createMockScheduler();
		const holder = new CertificateHolder(mockCert, scheduler);
		expect(holder.getCurrentCert()).toBe(mockCert);
	});

	it("should start auto renew via scheduler", () => {
		const scheduler = createMockScheduler();
		const holder = new CertificateHolder(mockCert, scheduler);

		holder.startAutoRenew();

		expect(scheduler.scheduleRenew).toHaveBeenCalledWith(mockCert);
		expect(scheduler.start).toHaveBeenCalled();
	});

	it("should stop auto renew via scheduler", () => {
		const scheduler = createMockScheduler();
		const holder = new CertificateHolder(mockCert, scheduler);

		holder.stopAutoRenew();

		expect(scheduler.stop).toHaveBeenCalled();
	});
});
