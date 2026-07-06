import { afterAll, describe, expect, it, jest } from "@jest/globals";

const MOCK_REGISTER_HANDLER = jest.fn<any>();

jest.mock("@trading-model/common/worker/base-worker", () => ({
	BaseWorker: jest.fn().mockImplementation(() => ({
		registerHandler: MOCK_REGISTER_HANDLER,
	})),
	__esModule: true,
}));

jest.mock("../src/generate-key-pair", () => ({
	generateKeyPair: jest.fn(() => ({ publicKey: "pk", privateKey: "sk" })),
	generateKeyPairWithIdSync: jest.fn(() => ({
		publicKey: "pk",
		privateKey: "sk",
		id: "id1",
	})),
	KeyAlgorithm: { rsa4096: "rsa", ecP384: "ec" },
}));

jest.mock("../src/sign-certificate", () => ({
	signCertificate: jest.fn(() => ({
		serialNumber: "SN-001",
		certPem: "cert",
		caPem: "ca",
		serviceId: "svc",
		issuedAt: new Date(),
		expiresAt: new Date(),
		fingerprint: "fp",
	})),
}));

jest.mock("../src/create-csr", () => ({
	createCsr: jest.fn(() => "csr-pem"),
}));

jest.mock("../src/validate-certificate", () => ({
	validateCertificate: jest.fn(() => ({ valid: true })),
}));

jest.mock("../src/sign", () => ({
	parseKey: jest.fn(() => ({ publicKey: "pk", privateKey: "sk" })),
	sign: jest.fn(() => "signature"),
}));

import { createCsr } from "../src/create-csr";
import { createCryptoWorker } from "../src/crypto-worker";
import {
	generateKeyPair,
	generateKeyPairWithIdSync,
	KeyAlgorithm,
} from "../src/generate-key-pair";
import { parseKey, sign } from "../src/sign";
import { signCertificate } from "../src/sign-certificate";
import { validateCertificate } from "../src/validate-certificate";

function getHandler(type: string): (job: any) => Promise<any> {
	const call = MOCK_REGISTER_HANDLER.mock.calls.find(
		(c: any[]) => c[0] === type
	);
	return call ? (call[1] as (job: any) => any) : () => Promise.resolve();
}

describe("createCryptoWorker", () => {
	it("should create a BaseWorker and register all handlers", () => {
		const config = {
			serverUrl: "ws://localhost",
			schedulerHttpUrl: "http://localhost",
			capabilities: ["crypto"],
			maxConcurrency: 1,
		};
		const worker = createCryptoWorker(config);

		expect(worker).toBeDefined();
		expect(MOCK_REGISTER_HANDLER).toHaveBeenCalledTimes(7);
	});

	it("should register generateKeyPair handler that calls generateKeyPair", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("generateKeyPair");
		const result = await handler({
			payload: { algorithm: KeyAlgorithm.ecP384 },
		});

		expect(generateKeyPair).toHaveBeenCalledWith(KeyAlgorithm.ecP384);
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});

	it("should register generateKeyPairWithId handler", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("generateKeyPairWithId");
		const result = await handler({
			payload: { algorithm: KeyAlgorithm.rsa4096 },
		});

		expect(generateKeyPairWithIdSync).toHaveBeenCalledWith(
			KeyAlgorithm.rsa4096
		);
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "id1" });
	});

	it("should register signCertificate handler", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("signCertificate");
		const opts = {
			csr: "csr",
			serviceId: "svc",
			caKeyPair: {} as any,
			caCertPem: "ca",
			ttlMs: 3600000,
		};
		const result = await handler({ payload: opts });

		expect(signCertificate).toHaveBeenCalledWith(opts);
		expect(result.serialNumber).toBe("SN-001");
	});

	it("should register createCsr handler", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("createCsr");
		const opts = { commonName: "test", san: [], keyPem: "key" };
		const result = await handler({ payload: opts });

		expect(createCsr).toHaveBeenCalledWith(opts);
		expect(result).toBe("csr-pem");
	});

	it("should register validateCertificate handler", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("validateCertificate");
		const result = await handler({
			payload: { certPem: "cert", caCertPem: "ca" },
		});

		expect(validateCertificate).toHaveBeenCalledWith("cert", "ca");
		expect(result.valid).toBe(true);
	});

	it("should register validateCertificate handler without caCertPem", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("validateCertificate");
		const result = await handler({ payload: { certPem: "cert" } });

		expect(validateCertificate).toHaveBeenCalledWith("cert", "");
		expect(result.valid).toBe(true);
	});

	it("should register parseKey handler", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("parseKey");
		const result = await handler({ payload: { privateKey: "key" } });

		expect(parseKey).toHaveBeenCalledWith("key");
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
	});

	it("should register sign handler", async () => {
		createCryptoWorker({} as any);
		const handler = getHandler("sign");
		const result = await handler({
			payload: { algorithm: "sha256", body: "body", privateKey: "key" },
		});

		expect(sign).toHaveBeenCalledWith({ algorithm: "sha256", body: "body", privateKey: "key" });
		expect(result).toBe("signature");
	});

	afterAll(() => {
		jest.unmock("../src/generate-key-pair");
		jest.unmock("../src/sign-certificate");
		jest.unmock("../src/create-csr");
		jest.unmock("../src/validate-certificate");
		jest.unmock("../src/sign");
	});
});
