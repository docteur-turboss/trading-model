import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const MOCK_READ_FILE = jest.fn<any>();
const MOCK_WRITE_FILE = jest.fn<any>();
const MOCK_MKDIR = jest.fn<any>();
const MOCK_ACCESS = jest.fn<any>();

jest.mock("node:fs/promises", () => ({
	readFile: (...args: any[]) => MOCK_READ_FILE(...args),
	writeFile: (...args: any[]) => MOCK_WRITE_FILE(...args),
	mkdir: (...args: any[]) => MOCK_MKDIR(...args),
	access: (...args: any[]) => MOCK_ACCESS(...args),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		warn: jest.fn<any>(),
	},
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: jest.fn((err: any) =>
		err instanceof Error ? err : new Error(String(err))
	),
}));

jest.mock("../src/generate-key-pair", () => ({
	generateKeyPair: jest.fn(() => ({
		publicKey: "pk" as never,
		privateKey: "sk" as never,
	})),
	generateKeyPairWithId: jest.fn(() => ({
		publicKey: "pk" as never,
		privateKey: "sk" as never,
		id: "key-id",
	})),
	KeyAlgorithm: { Rsa4096: "rsa", EcP384: "ec" },
}));

jest.mock("../src/keygen/generate-key-pair", () => ({
	generateKeyPair: jest.fn(() => ({
		publicKey: "pk" as never,
		privateKey: "sk" as never,
	})),
	generateKeyPairWithId: jest.fn(() => ({
		publicKey: "pk" as never,
		privateKey: "sk" as never,
		id: "key-id",
	})),
	KeyAlgorithm: { Rsa4096: "rsa", EcP384: "ec" },
}));

import {
	generateKeyPairWithId,
	KeyAlgorithm,
} from "../src/keygen/generate-key-pair";
import { FileKeyVault } from "../src/vault/key-vault";

describe("FileKeyVault", () => {
	let vault: FileKeyVault;

	beforeEach(() => {
		jest.clearAllMocks();
		vault = new FileKeyVault();
	});

	it("generate should call generateKeyPairWithId", async () => {
		const result = await vault.generate();

		expect(generateKeyPairWithId).toHaveBeenCalledWith(KeyAlgorithm.EcP384);
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "key-id" });
	});

	it("generate should pass algorithm to generateKeyPairWithId", async () => {
		const result = await vault.generate(KeyAlgorithm.Rsa4096);

		expect(generateKeyPairWithId).toHaveBeenCalledWith(KeyAlgorithm.Rsa4096);
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "key-id" });
	});

	it("read should read private key from file", async () => {
		MOCK_READ_FILE.mockResolvedValue(
			"-----BEGIN PRIVATE KEY-----\nprivate-key-content"
		);
		const result = await vault.read("/path/to/key.pem");

		expect(MOCK_READ_FILE).toHaveBeenCalledWith("/path/to/key.pem", "utf8");
		expect(result).toEqual({
			publicKey: "",
			privateKey: "-----BEGIN PRIVATE KEY-----\nprivate-key-content",
		});
	});

	it("write should create directory and write file", async () => {
		MOCK_MKDIR.mockResolvedValue(undefined);
		MOCK_WRITE_FILE.mockResolvedValue(undefined);

		await vault.write("/keys/my-key.pem", {
			publicKey: "pk" as never,
			privateKey: "sk" as never,
		});

		expect(MOCK_MKDIR).toHaveBeenCalledWith("/keys", { recursive: true });
		expect(MOCK_WRITE_FILE).toHaveBeenCalledWith("/keys/my-key.pem", "sk", {
			mode: 0o600,
		});
	});

	it("write should accept custom mode", async () => {
		MOCK_MKDIR.mockResolvedValue(undefined);
		MOCK_WRITE_FILE.mockResolvedValue(undefined);

		await vault.write(
			"/keys/my-key.pem",
			{ publicKey: "pk" as never, privateKey: "sk" as never },
			{ mode: 0o400 }
		);

		expect(MOCK_WRITE_FILE).toHaveBeenCalledWith("/keys/my-key.pem", "sk", {
			mode: 0o400,
		});
	});

	it("exists should return true when file is accessible", async () => {
		MOCK_ACCESS.mockResolvedValue(undefined);
		const result = await vault.exists("/path/to/key.pem");

		expect(MOCK_ACCESS).toHaveBeenCalledWith("/path/to/key.pem", 4);
		expect(result).toBe(true);
	});

	it("exists should return false when file is not accessible", async () => {
		const fsError = new Error("ENOENT");
		(fsError as any).code = "ENOENT";
		MOCK_ACCESS.mockRejectedValue(fsError);

		const result = await vault.exists("/path/to/key.pem");

		expect(MOCK_ACCESS).toHaveBeenCalledWith("/path/to/key.pem", 4);
		expect(result).toBe(false);
	});

	afterAll(() => {
		jest.unmock("../src/generate-key-pair");
	});
});
