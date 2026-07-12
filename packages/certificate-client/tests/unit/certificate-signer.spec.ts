import { describe, expect, it, jest } from "@jest/globals";

const MOCK_SIGN = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("@trading-model/crypto/ca/ca-client", () => ({
	CaClient: jest.fn(() => ({ signCertificate: MOCK_SIGN })),
}));

import { CertificateSigner } from "../../src/certificate-signer";

describe("CertificateSigner", () => {
	it("should sign CSR via CA client without bootstrap token", async () => {
		MOCK_SIGN.mockResolvedValue({
			certPem: "cert" as any,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: "2027-01-01",
		});

		const caClient = { signCertificate: MOCK_SIGN } as any;
		const signer = new CertificateSigner(
			{ serviceId: "svc-1" as any },
			caClient
		);

		const result = await signer.signWithCa(
			"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
		);

		expect(MOCK_SIGN).toHaveBeenCalledWith({
			serviceId: "svc-1",
			csr: expect.stringContaining("CERTIFICATE REQUEST"),
			bootstrapToken: undefined,
		});
		expect(result.certPem).toBe("cert" as any);
	});

	it("should pass bootstrap token when configured", async () => {
		MOCK_SIGN.mockResolvedValue({
			certPem: "cert" as any,
			caPem: "ca" as any,
			serialNumber: "SN" as any,
			expiresAt: "2027-01-01",
		});

		const caClient = { signCertificate: MOCK_SIGN } as any;
		const signer = new CertificateSigner(
			{ serviceId: "svc-1" as any, bootstrapToken: "my-token" },
			caClient
		);

		await signer.signWithCa(
			"-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----"
		);

		expect(MOCK_SIGN).toHaveBeenCalledWith({
			serviceId: "svc-1",
			csr: expect.any(String),
			bootstrapToken: expect.any(String),
		});
	});
});
