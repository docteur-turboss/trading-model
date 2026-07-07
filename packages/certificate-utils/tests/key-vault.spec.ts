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
	generateKeyPair: jest.fn(() => ({ publicKey: "pk", privateKey: "sk" })),
	generateKeyPairWithId: jest.fn(() => ({
		publicKey: "pk",
		privateKey: "sk",
		id: "key-id",
	})),
	KeyAlgorithm: { rsa4096: "rsa", ecP384: "ec" },
}));

import { generateKeyPairWithId } from "../src/generate-key-pair";
import { FileKeyVault } from "../src/vault/key-vault";

describe("FileKeyVault", () => {
	let vault: FileKeyVault;

	beforeEach(() => {
		jest.clearAllMocks();
		vault = new FileKeyVault();
	});

	it("generate should call generateKeyPairWithId", async () => {
		const result = await vault.generate();

		expect(generateKeyPairWithId).toHaveBeenCalledWith("ec");
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "key-id" });
	});

	it("generate should pass algorithm to generateKeyPairWithId", async () => {
		const result = await vault.generate("rsa");

		expect(generateKeyPairWithId).toHaveBeenCalledWith("rsa");
		expect(result).toEqual({ publicKey: "pk", privateKey: "sk", id: "key-id" });
	});

	it("read should read private key from file", async () => {
		MOCK_READ_FILE.mockResolvedValue("private-key-content");
		const result = await vault.read("/path/to/key.pem");

		expect(MOCK_READ_FILE).toHaveBeenCalledWith("/path/to/key.pem", "utf8");
		expect(result).toEqual({
			publicKey: "",
			privateKey: "private-key-content",
		});
	});

	it("write should create directory and write file", async () => {
		MOCK_MKDIR.mockResolvedValue(undefined);
		MOCK_WRITE_FILE.mockResolvedValue(undefined);

		await vault.write("/keys/my-key.pem", {
			publicKey: "pk",
			privateKey: "sk",
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
			{ publicKey: "pk", privateKey: "sk" },
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
