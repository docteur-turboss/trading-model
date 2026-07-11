import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockVerify = jest.fn().mockReturnValue(true);

jest.mock("../../src/domain/pop-verifier", () => ({
	PopVerifier: jest.fn().mockImplementation(() => ({
		verify: mockVerify,
	})),
}));

import {
	CertRenewalError,
	CertRenewalService,
} from "../../src/domain/cert-renewal-service";

const VALID_CSR =
	"-----BEGIN CERTIFICATE REQUEST-----\ncsr-data\n-----END CERTIFICATE REQUEST-----";

describe("CertRenewalService", () => {
	const mockCertStore = {
		getBySerial: jest.fn(),
	};
	const mockNonceStore = {
		consume: jest.fn(),
	};
	const mockCa = {
		signServiceCertificate: jest.fn(),
	};
	const mockLock = {
		acquire: jest.fn(),
		release: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should throw CertRenewalError when nonce is invalid", async () => {
		mockNonceStore.consume.mockResolvedValue(false);

		const service = new CertRenewalService({
			certStore: mockCertStore as any,
			nonceStore: mockNonceStore as any,
			ca: mockCa as any,
		});

		await expect(
			service.renew({
				serviceId: "svc-1",
				oldSerialNumber: "SN-001",
				nonce: "nonce",
				signature: "sig",
				csr: VALID_CSR,
			})
		).rejects.toThrow(CertRenewalError);

		await expect(
			service.renew({
				serviceId: "svc-1",
				oldSerialNumber: "SN-001",
				nonce: "nonce",
				signature: "sig",
				csr: VALID_CSR,
			})
		).rejects.toHaveProperty("statusCode", 401);
	});

	it("should throw CertRenewalError when old cert not found", async () => {
		mockNonceStore.consume.mockResolvedValue(true);
		mockCertStore.getBySerial.mockResolvedValue(null);

		const service = new CertRenewalService({
			certStore: mockCertStore as any,
			nonceStore: mockNonceStore as any,
			ca: mockCa as any,
		});

		await expect(
			service.renew({
				serviceId: "svc-1",
				oldSerialNumber: "SN-001",
				nonce: "nonce",
				signature: "sig",
				csr: VALID_CSR,
			})
		).rejects.toThrow("Original certificate not found");
	});

	it("should throw CertRenewalError when lock cannot be acquired", async () => {
		mockNonceStore.consume.mockResolvedValue(true);
		mockCertStore.getBySerial.mockResolvedValue({
			certPem: "valid-pem",
			serviceId: "svc-1",
		});
		mockLock.acquire.mockResolvedValue(false);

		const service = new CertRenewalService({
			certStore: mockCertStore as any,
			nonceStore: mockNonceStore as any,
			ca: mockCa as any,
			lock: mockLock as any,
		});

		await expect(
			service.renew({
				serviceId: "svc-1",
				oldSerialNumber: "SN-002",
				nonce: "nonce",
				signature: "sig",
				csr: VALID_CSR,
			})
		).rejects.toThrow("Could not acquire distributed lock");
	});

	it("should sign and return new certificate with lock", async () => {
		mockNonceStore.consume.mockResolvedValue(true);
		mockCertStore.getBySerial.mockResolvedValue({
			certPem: "valid-pem",
			serviceId: "svc-1",
		});
		mockLock.acquire.mockResolvedValue(true);
		const signedCert = {
			certPem: "new-cert",
			caPem: "ca-pem",
			serialNumber: "SN-003",
			expiresAt: new Date(),
			fingerprint: "fp",
		};
		mockCa.signServiceCertificate.mockResolvedValue(signedCert);

		const service = new CertRenewalService({
			certStore: mockCertStore as any,
			nonceStore: mockNonceStore as any,
			ca: mockCa as any,
			lock: mockLock as any,
		});

		const result = await service.renew({
			serviceId: "svc-1",
			oldSerialNumber: "SN-002",
			nonce: "nonce",
			signature: "sig",
			csr: VALID_CSR,
		});

		expect(result).toEqual(signedCert);
		expect(mockLock.acquire).toHaveBeenCalled();
		expect(mockLock.release).toHaveBeenCalled();
	});

	it("should sign certificate without lock", async () => {
		mockNonceStore.consume.mockResolvedValue(true);
		mockCertStore.getBySerial.mockResolvedValue({
			certPem: "valid-pem",
			serviceId: "svc-1",
		});
		const signedCert = {
			certPem: "new-cert",
			caPem: "ca-pem",
			serialNumber: "SN-004",
			expiresAt: new Date(),
			fingerprint: "fp",
		};
		mockCa.signServiceCertificate.mockResolvedValue(signedCert);

		const service = new CertRenewalService({
			certStore: mockCertStore as any,
			nonceStore: mockNonceStore as any,
			ca: mockCa as any,
		});

		const result = await service.renew({
			serviceId: "svc-1",
			oldSerialNumber: "SN-002",
			nonce: "nonce",
			signature: "sig",
			csr: VALID_CSR,
		});

		expect(result).toEqual(signedCert);
	});
});
