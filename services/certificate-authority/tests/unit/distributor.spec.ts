import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/certificate-utils/validate-certificate", () => ({
	validateCertificate: jest.fn(),
}));

import { validateCertificate } from "@trading-model/certificate-utils/validate-certificate";
import { Distributor } from "../../src/core/distributor";

const MOCK_CA = {
	isInitialized: jest.fn(),
	getCaCertPem: jest
		.fn()
		.mockReturnValue(
			"-----BEGIN CERTIFICATE-----\nca-cert\n-----END CERTIFICATE-----"
		),
	signServiceCertificate: jest.fn(),
	revokeCertificate: jest.fn(),
	getCrl: jest.fn(),
	initialize: jest.fn(),
};

const MOCK_CERTIFICATE_STORE = {
	connect: jest.fn(),
	disconnect: jest.fn(),
	save: jest.fn(),
	getBySerial: jest.fn(),
	getByServiceId: jest.fn(),
	getExpiring: jest.fn(),
};

const MOCK_CRL_STORE = {
	connect: jest.fn(),
	disconnect: jest.fn(),
	add: jest.fn(),
	getAll: jest.fn(),
	isRevoked: jest.fn(),
};

const FAKE_CERT = {
	serialNumber: "SN-001",
	certPem: "-----BEGIN CERTIFICATE-----\ncert-data\n-----END CERTIFICATE-----",
	caPem: "-----BEGIN CERTIFICATE-----\nca-data\n-----END CERTIFICATE-----",
	serviceId: "svc-1",
	issuedAt: new Date(),
	expiresAt: new Date(Date.now() + 3600000),
	fingerprint: "abc123",
};

describe("Distributor", () => {
	let distributor: Distributor;

	beforeEach(() => {
		jest.clearAllMocks();

		distributor = new Distributor({
			ca: MOCK_CA as any,
			certificateStore: MOCK_CERTIFICATE_STORE as any,
			crlStore: MOCK_CRL_STORE as any,
		});
	});

	describe("getCertificate", () => {
		it("should return null when certificate not found", async () => {
			MOCK_CERTIFICATE_STORE.getByServiceId.mockResolvedValue(null);

			const result = await distributor.getCertificate("svc-missing");

			expect(result).toBeNull();
		});

		it("should return null when certificate validation fails", async () => {
			MOCK_CERTIFICATE_STORE.getByServiceId.mockResolvedValue(FAKE_CERT);
			(validateCertificate as jest.Mock).mockReturnValue({
				valid: false,
				reason: "expired",
			});

			const result = await distributor.getCertificate("svc-1");

			expect(result).toBeNull();
		});

		it("should return certificate when validation passes", async () => {
			MOCK_CERTIFICATE_STORE.getByServiceId.mockResolvedValue(FAKE_CERT);
			(validateCertificate as jest.Mock).mockReturnValue({ valid: true });

			const result = await distributor.getCertificate("svc-1");

			expect(result).toEqual(FAKE_CERT);
		});
	});

	describe("requestCertificate", () => {
		it("should sign and return a new certificate", async () => {
			const newCert = { ...FAKE_CERT, serialNumber: "SN-NEW" };
			MOCK_CA.signServiceCertificate.mockResolvedValue(newCert);

			const result = await distributor.requestCertificate(
				"svc-new",
				"csr-body"
			);

			expect(MOCK_CA.signServiceCertificate).toHaveBeenCalledWith(
				expect.objectContaining({
					serviceId: "svc-new",
					csr: "csr-body",
				})
			);
			expect(result.serialNumber).toBe("SN-NEW");
		});

		it("should pass bootstrap token to CA signing", async () => {
			const newCert = { ...FAKE_CERT, serialNumber: "SN-BOOT" };
			MOCK_CA.signServiceCertificate.mockResolvedValue(newCert);

			const result = await distributor.requestCertificate(
				"svc-boot",
				"csr-body",
				"bootstrap-token-123"
			);

			expect(MOCK_CA.signServiceCertificate).toHaveBeenCalledWith({
				serviceId: "svc-boot",
				csr: "csr-body",
				bootstrapToken: "bootstrap-token-123",
			});
			expect(result.serialNumber).toBe("SN-BOOT");
		});
	});
});
