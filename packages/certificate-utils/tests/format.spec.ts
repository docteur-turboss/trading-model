import { describe, expect, it, jest } from "@jest/globals";

const MOCK_FGE_CERT = {
	serialNumber: "1234567890ABCDEF",
};
const MOCK_FGE_CERT_FROM_PEM = jest.fn().mockReturnValue(MOCK_FGE_CERT);
const MOCK_FGE_PRIVATE_KEY_FROM_PEM = jest.fn().mockReturnValue({} as any);
const MOCK_FGE_CERTIFICATION_REQUEST_FROM_PEM = jest.fn();
const MOCK_FGE_PUBLIC_KEY_TO_PEM = jest.fn();

jest.mock("node-forge", () => ({
	pki: {
		certificateFromPem: MOCK_FGE_CERT_FROM_PEM,
		privateKeyFromPem: MOCK_FGE_PRIVATE_KEY_FROM_PEM,
		certificationRequestFromPem: MOCK_FGE_CERTIFICATION_REQUEST_FROM_PEM,
		publicKeyToPem: MOCK_FGE_PUBLIC_KEY_TO_PEM,
	},
}));

jest.mock("node:crypto", () => {
	const actual = jest.requireActual("node:crypto") as any;
	return {
		...actual,
		X509Certificate: jest.fn(),
	};
});

import {
	chunks,
	parseCertInfo,
	parseCsrInfo,
	privateKeyFromPem,
	resolvePublicKey,
} from "../src/format/format";

describe("chunks", () => {
	it("should split a string into chunks of given size", () => {
		expect(chunks("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
	});

	it("should handle last chunk shorter than size", () => {
		expect(chunks("abcde", 2)).toEqual(["ab", "cd", "e"]);
	});

	it("should return empty array for empty string", () => {
		expect(chunks("", 2)).toEqual([]);
	});

	it("should return single chunk when size equals length", () => {
		expect(chunks("abc", 3)).toEqual(["abc"]);
	});

	it("should return single chunk when size exceeds length", () => {
		expect(chunks("ab", 5)).toEqual(["ab"]);
	});
});

describe("resolvePublicKey", () => {
	it("should resolve a public key from issuer cert string", () => {
		const crypto = jest.requireActual(
			"node:crypto"
		) as typeof import("node:crypto");
		const kp = crypto.generateKeyPairSync("ec", {
			namedCurve: "P-384",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		const key = resolvePublicKey(kp.publicKey);
		expect(key).toBeDefined();
		expect(key.type).toBe("public");
		expect(key.asymmetricKeyType).toBe("ec");
	});
});

describe("parseCertInfo", () => {
	it("should parse certificate info from PEM", () => {
		const now = new Date();
		const later = new Date(now.getTime() + 3600000);
		const MockX509 = (jest.requireMock("node:crypto") as any).X509Certificate;
		const mockX509 = {
			subject: "CN=test-service",
			issuer: "CN=TradingModelCA",
			validFrom: now.toISOString(),
			validTo: later.toISOString(),
			fingerprint256:
				"AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB",
			subjectAltName: "DNS:test.internal, DNS:test2.internal",
		};
		MockX509.mockReturnValue(mockX509);

		const info = parseCertInfo("cert-pem");

		expect(MockX509).toHaveBeenCalledWith("cert-pem");
		expect(MOCK_FGE_CERT_FROM_PEM).toHaveBeenCalledWith("cert-pem");
		expect(info.subject).toBe("CN=test-service");
		expect(info.issuer).toBe("CN=TradingModelCA");
		expect(info.serialNumber).toBe("1234567890ABCDEF");
		expect(info.notBefore.getTime()).toBe(now.getTime());
		expect(info.notAfter.getTime()).toBe(later.getTime());
		expect(info.fingerprint).toBe(
			"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab"
		);
		expect(info.san).toEqual(["test.internal", "test2.internal"]);
	});

	it("should handle missing subjectAltName", () => {
		const MockX509 = (jest.requireMock("node:crypto") as any).X509Certificate;
		const mockX509 = {
			subject: "CN=test",
			issuer: "CN=CA",
			validFrom: new Date().toISOString(),
			validTo: new Date(Date.now() + 3600000).toISOString(),
			fingerprint256:
				"AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
			subjectAltName: null,
		};
		MockX509.mockReturnValue(mockX509);
		MOCK_FGE_CERT_FROM_PEM.mockReturnValue({ serialNumber: "SN" });

		const info = parseCertInfo("cert-pem");

		expect(info.san).toEqual([]);
	});
});

describe("privateKeyFromPem", () => {
	it("should convert an EC private key to forge format", () => {
		const crypto = jest.requireActual(
			"node:crypto"
		) as typeof import("node:crypto");
		const kp = crypto.generateKeyPairSync("ec", {
			namedCurve: "P-384",
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		MOCK_FGE_PRIVATE_KEY_FROM_PEM.mockReturnValue({} as any);

		const result = privateKeyFromPem(kp.privateKey);

		expect(MOCK_FGE_PRIVATE_KEY_FROM_PEM).toHaveBeenCalled();
		expect(result).toBeDefined();
	});

	it("should convert an RSA private key to forge format", () => {
		const crypto = jest.requireActual(
			"node:crypto"
		) as typeof import("node:crypto");
		const kp = crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: { type: "spki", format: "pem" },
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
		});
		MOCK_FGE_PRIVATE_KEY_FROM_PEM.mockReturnValue({} as any);

		const result = privateKeyFromPem(kp.privateKey);

		expect(MOCK_FGE_PRIVATE_KEY_FROM_PEM).toHaveBeenCalled();
		expect(result).toBeDefined();
	});
});

describe("parseCsrInfo", () => {
	it("should parse CSR info with SAN extensions", () => {
		const mockCsr = {
			subject: {
				getField: jest.fn((name: string) =>
					name === "CN" ? { value: "test-service" } : undefined
				),
			},
			getAttribute: jest.fn(() => ({
				extensions: [
					{
						name: "subjectAltName",
						altNames: [
							{ type: 2, value: "san1.example.com" },
							{ type: 2, value: "san2.example.com" },
							{ type: 1, value: "10.0.0.1" },
						],
					},
				],
			})),
			publicKey: "public-key-obj" as any,
		};
		MOCK_FGE_CERTIFICATION_REQUEST_FROM_PEM.mockReturnValue(mockCsr);
		MOCK_FGE_PUBLIC_KEY_TO_PEM.mockReturnValue("public-key-pem");

		const info = parseCsrInfo("csr-pem");

		expect(MOCK_FGE_CERTIFICATION_REQUEST_FROM_PEM).toHaveBeenCalledWith(
			"csr-pem"
		);
		expect(info.commonName).toBe("test-service");
		expect(info.san).toEqual(["san1.example.com", "san2.example.com"]);
		expect(info.publicKeyPem).toBe("public-key-pem");
	});

	it("should handle CSR with no SAN extensions", () => {
		const mockCsr = {
			subject: {
				getField: jest.fn(() => undefined),
			},
			getAttribute: jest.fn(() => null),
			publicKey: "public-key-obj" as any,
		};
		MOCK_FGE_CERTIFICATION_REQUEST_FROM_PEM.mockReturnValue(mockCsr);
		MOCK_FGE_PUBLIC_KEY_TO_PEM.mockReturnValue("public-key-pem");

		const info = parseCsrInfo("csr-pem");

		expect(info.commonName).toBe("");
		expect(info.san).toEqual([]);
		expect(info.publicKeyPem).toBe("public-key-pem");
	});

	it("should handle CSR with altNames but different extension name", () => {
		const mockCsr = {
			subject: {
				getField: jest.fn(() => undefined),
			},
			getAttribute: jest.fn(() => ({
				extensions: [
					{
						name: "keyUsage",
						altNames: [{ type: 2, value: "should-not-appear" }],
					},
				],
			})),
			publicKey: null,
		};
		MOCK_FGE_CERTIFICATION_REQUEST_FROM_PEM.mockReturnValue(mockCsr);

		const info = parseCsrInfo("csr-pem");

		expect(info.commonName).toBe("");
		expect(info.san).toEqual([]);
		expect(info.publicKeyPem).toBe("");
	});
});
