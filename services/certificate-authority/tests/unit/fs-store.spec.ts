import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockReadFile = jest.fn();
const mockReaddir = jest.fn();
const mockRename = jest.fn().mockResolvedValue(undefined);
const mockUnlink = jest.fn().mockResolvedValue(undefined);

jest.mock("node:fs/promises", () => ({
	mkdir: mockMkdir,
	writeFile: mockWriteFile,
	readFile: mockReadFile,
	readdir: mockReaddir,
	rename: mockRename,
	unlink: mockUnlink,
}));

jest.mock("@trading-model/common/utils/errors", () => ({
	normalizeError: (err: Error) => err,
}));

import { createFsStore, NULL_FS_STORE } from "../../src/persistence/fs-store";

function validEncryptionKey(): string {
	return randomBytes(32).toString("base64");
}

describe("FsStore", () => {
	const TEST_KEY = "test-key";
	const TEST_DATA = { value: 42 };

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should be disabled when disableFallback is true", () => {
		const store = createFsStore({ disableFallback: true });
		expect(store.disabled).toBe(true);
	});

	it("should not create directory when disabled", async () => {
		const store = NULL_FS_STORE;
		await store.init();
		expect(mockMkdir).not.toHaveBeenCalled();
	});

	it("should return null from get when disabled", async () => {
		const store = NULL_FS_STORE;
		const result = await store.get(TEST_KEY);
		expect(result).toBeNull();
	});

	it("should silently succeed on save when disabled", async () => {
		const store = NULL_FS_STORE;
		await expect(store.save(TEST_KEY, TEST_DATA)).resolves.toBeUndefined();
	});

	it("should return empty array from getAll when disabled", async () => {
		const store = NULL_FS_STORE;
		const result = await store.getAll();
		expect(result).toEqual([]);
	});

	it("should not call unlink when disabled on delete", async () => {
		const store = NULL_FS_STORE;
		await store.delete(TEST_KEY);
		expect(mockUnlink).not.toHaveBeenCalled();
	});

	it("should init and create directory", async () => {
		const store = createFsStore();
		await store.init();
		expect(mockMkdir).toHaveBeenCalled();
	});

	it("should save and retrieve data", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify(TEST_DATA));

		const store = createFsStore();
		await store.save(TEST_KEY, TEST_DATA);

		const result = await store.get(TEST_KEY);
		expect(result).toEqual(TEST_DATA);
		expect(mockWriteFile).toHaveBeenCalled();
	});

	it("should return null from get when file not found", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));

		const store = createFsStore();
		const result = await store.get("missing-key");
		expect(result).toBeNull();
	});

	it("should return all entries from getAll", async () => {
		mockReaddir.mockResolvedValue(["key1.json", "key2.json", "other.txt"]);
		mockReadFile
			.mockResolvedValueOnce(JSON.stringify({ a: 1 }))
			.mockResolvedValueOnce(JSON.stringify({ b: 2 }));

		const store = createFsStore();
		const results = await store.getAll<Record<string, number>>();
		expect(results).toHaveLength(2);
	});

	it("should delete a key", async () => {
		mockUnlink.mockResolvedValue(undefined);

		const store = createFsStore();
		await store.delete(TEST_KEY);
		expect(mockUnlink).toHaveBeenCalled();
	});

	it("should not throw on delete when file is missing", async () => {
		mockUnlink.mockRejectedValue(new Error("ENOENT"));

		const store = createFsStore();
		await expect(store.delete(TEST_KEY)).resolves.toBeUndefined();
	});

	it("should skip corrupted files in getAll", async () => {
		mockReaddir.mockResolvedValue(["good.json", "bad.json"]);
		mockReadFile
			.mockResolvedValueOnce(JSON.stringify({ ok: true }))
			.mockRejectedValueOnce(new Error("corrupt"));

		const store = createFsStore();
		const results = await store.getAll<Record<string, boolean>>();
		expect(results).toHaveLength(1);
	});

	it("should save and retrieve encrypted data", async () => {
		const key = validEncryptionKey();
		const encryptedContent = "dGVzdDp0ZXN0OnRlc3Q="; // fake encrypted payload
		mockReadFile.mockResolvedValue(encryptedContent);

		mockWriteFile.mockImplementation(async (_path: string, content: string) => {
			mockReadFile.mockResolvedValue(content);
		});

		const store = createFsStore({ encryptionKey: key });
		await store.save(TEST_KEY, TEST_DATA);

		const result = await store.get<typeof TEST_DATA>(TEST_KEY);
		expect(result).toEqual(TEST_DATA);
	});

	it("should handle getAll with .enc extension filtering", async () => {
		mockReaddir.mockResolvedValue(["key1.enc", "key2.enc", "other.txt"]);
		mockReadFile
			.mockResolvedValueOnce(
				Buffer.from(JSON.stringify({ secured: true })).toString("base64")
			)
			.mockResolvedValueOnce(
				Buffer.from(JSON.stringify({ secured: false })).toString("base64")
			);

		const key = validEncryptionKey();
		const store = createFsStore({ encryptionKey: key });
		await store.init();

		const results = await store.getAll<Record<string, boolean>>();
		expect(results).toHaveLength(0); // encrypted payloads fail decryption
	});

	it("should return empty array from getAll when readdir fails", async () => {
		mockReaddir.mockRejectedValue(new Error("ENOENT"));

		const store = createFsStore();
		const results = await store.getAll();
		expect(results).toEqual([]);
	});

	it("should handle init with encryption key", async () => {
		const key = validEncryptionKey();
		const store = createFsStore({ encryptionKey: key });
		await store.init();
		expect(mockMkdir).toHaveBeenCalled();
	});
});
