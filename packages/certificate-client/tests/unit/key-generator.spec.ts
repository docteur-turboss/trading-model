import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/certificate-utils/async", () => ({
	generateKeyPairAsync:
		jest.fn<() => Promise<{ privateKey: string; publicKey: string }>>(),
	createCsrAsync: jest.fn<() => Promise<string>>(),
}));

jest.mock("@trading-model/certificate-utils/generate-key-pair", () => ({
	KeyAlgorithm: { EcP384: "ec", Rsa4096: "rsa" },
}));

import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyGenerator } from "../../src/key-generator";

describe("KeyGenerator", () => {
	it("should generate key pair and CSR", async () => {
		jest.mocked(generateKeyPairAsync).mockResolvedValue({
			privateKey: "pk" as never,
			publicKey: "pub" as never,
		});
		jest.mocked(createCsrAsync).mockResolvedValue("csr-pem" as never);

		const generator = new KeyGenerator({
			commonName: "test-svc",
			san: ["test.local"],
		});

		const result = await generator.generateKeyAndCsr();

		expect(generateKeyPairAsync).toHaveBeenCalled();
		expect(createCsrAsync).toHaveBeenCalledWith({
			commonName: "test-svc",
			san: ["test.local"],
			keyPem: "pk",
		});
		expect(result).toEqual({
			keyPair: { privateKey: "pk", publicKey: "pub" },
			csr: "csr-pem",
		});
	});
});
