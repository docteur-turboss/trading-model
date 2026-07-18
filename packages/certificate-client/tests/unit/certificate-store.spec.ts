import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { UnixTimestamp } from "@trading-model/common/domain/primitives";

const mockMkdir = jest.fn<(...args: any[]) => Promise<void>>();
const mockWriteFile = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("node:fs/promises", () => ({
	mkdir: mockMkdir,
	writeFile: mockWriteFile,
}));

import { DiskCertificateStore } from "../../src/certificate-store";

describe("DiskCertificateStore", () => {
	const config = {
		tlsPaths: {
			certPath: "/etc/tls/cert.pem" as any,
			keyPath: "/etc/tls/key.pem" as any,
			caPath: "/etc/tls/ca.pem" as any,
		},
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should write certificates to disk", async () => {
		mockMkdir.mockResolvedValue(undefined as any);
		mockWriteFile.mockResolvedValue(undefined as any);

		const store = new DiskCertificateStore(config);
		await store.writeCertificates(
			{
				privateKey: "private-key-content" as any,
				publicKey: "pub-key-content" as any,
			},
			{ certPem: "cert-content" as any, caPem: "ca-content" as any }
		);

		expect(mockMkdir).toHaveBeenCalledWith("/etc/tls", { recursive: true });
		expect(mockWriteFile).toHaveBeenCalledWith(
			"/etc/tls/key.pem",
			"private-key-content",
			{ mode: 0o600 }
		);
		expect(mockWriteFile).toHaveBeenCalledWith(
			"/etc/tls/cert.pem",
			"cert-content",
			{ mode: 0o644 }
		);
		expect(mockWriteFile).toHaveBeenCalledWith(
			"/etc/tls/ca.pem",
			"ca-content",
			{ mode: 0o644 }
		);
	});

	it("should build obtained certificate from key pair and response", () => {
		const store = new DiskCertificateStore(config);
		const result = store.buildObtainedCert(
			{ privateKey: "pk-val" as any, publicKey: "pub-val" as any },
			{
				certPem: "cert-val" as any,
				caPem: "ca-val" as any,
				serialNumber: "SN-001" as any,
				expiresAt: "2027-06-15T00:00:00.000Z",
			}
		);

		expect(result.certPem).toBe("cert-val" as any);
		expect(result.keyPem).toBe("pk-val" as never);
		expect(result.caPem).toBe("ca-val" as any);
		expect(result.serialNumber).toBe("SN-001" as any);
		expect(result.expiresAt).toEqual(
			UnixTimestamp.of(new Date("2027-06-15T00:00:00.000Z").getTime())
		);
	});
});
